import Alert from '../utils/Alert';
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
  Animated,
  StatusBar,
  Share,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ApiService from "../utils/ApiService";
import visitorPassStyles from "../styles/VisitorPassStyles";

const SCHOOL_LOGO = require("../assets/LogoSapphire.jpg");

export default function VisitorPassScreen({ navigation, route }) {
  const { visitorId, visitorData: initialData } = route?.params || {};
  
  const [visitor, setVisitor] = useState(initialData || null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();

    if (visitorId && !initialData) {
      loadVisitorData();
    }
  }, [visitorId]);

  const loadVisitorData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await ApiService.getVisitorById(visitorId);
      if (response.success) {
        setVisitor(response.visitor);
      } else {
        setError('Visitor not found');
      }
    } catch (error) {
      console.error("Load visitor error:", error);
      setError(error.message);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (visitorId) {
      loadVisitorData();
    } else {
      setRefreshing(false);
    }
  };

  const handleSharePass = async () => {
    try {
      await Share.share({
        message: `Visitor Pass for ${visitor.fullName}\nID: ${visitor._id}\nDate: ${formatDate(visitor.visitDate)} at ${formatTime(visitor.visitTime)}\nPurpose: ${visitor.purposeOfVisit}`,
        title: 'Visitor Pass',
      });
    } catch (error) {
      Alert.alert("Error", "Failed to share pass");
    }
  };

  const handleAddToWallet = () => {
    Alert.alert(
      "Add to Wallet",
      "Add your visitor pass to Apple Wallet / Google Pay",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Add", onPress: () => Alert.alert("✅ Success", "Pass added to wallet") }
      ]
    );
  };

  const handleEmailPass = () => {
    Alert.alert(
      "Email Pass",
      "Send your visitor pass to your email",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send", onPress: () => Alert.alert("✅ Success", "Pass sent to your email") }
      ]
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = () => {
    switch(visitor?.status) {
      case 'approved':
      case 'checked_in':
        return '#10B981';
      case 'pending':
        return '#F59E0B';
      case 'checked_out':
      case 'expired':
        return '#6B7280';
      case 'rejected':
        return '#EF4444';
      default:
        return '#F59E0B';
    }
  };

  const getStatusText = () => {
    switch(visitor?.status) {
      case 'approved':
        return 'Approved';
      case 'checked_in':
        return 'Checked In';
      case 'checked_out':
        return 'Checked Out';
      case 'pending':
        return 'Pending Approval';
      case 'expired':
        return 'Expired';
      case 'rejected':
        return 'Rejected';
      default:
        return visitor?.status || 'Unknown';
    }
  };

  const getStatusIcon = () => {
    switch(visitor?.status) {
      case 'approved':
        return 'checkmark-circle';
      case 'checked_in':
        return 'log-in';
      case 'checked_out':
        return 'log-out';
      case 'pending':
        return 'time';
      case 'expired':
        return 'alert-circle';
      case 'rejected':
        return 'close-circle';
      default:
        return 'information-circle';
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={visitorPassStyles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0A3D91" />
        <Image source={SCHOOL_LOGO} resizeMode="contain" style={{ width: 116, height: 58, marginBottom: 18 }} />
        <ActivityIndicator size="large" color="#0A3D91" />
        <Text style={visitorPassStyles.loadingText}>Loading your visitor pass...</Text>
      </SafeAreaView>
    );
  }

  if (error || !visitor) {
    return (
      <SafeAreaView style={visitorPassStyles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0A3D91" />
        <View style={visitorPassStyles.header}>
          <TouchableOpacity
            style={visitorPassStyles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={visitorPassStyles.headerTitle}>Visitor Pass</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={visitorPassStyles.errorContent}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <Text style={visitorPassStyles.errorTitle}>Something went wrong</Text>
          <Text style={visitorPassStyles.errorMessage}>{error || 'Visitor pass not found'}</Text>
          <TouchableOpacity 
            style={visitorPassStyles.retryButton} 
            onPress={() => navigation.goBack()}
          >
            <Text style={visitorPassStyles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor();
  const statusText = getStatusText();
  const statusIcon = getStatusIcon();

  return (
    <SafeAreaView style={visitorPassStyles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0A3D91" />
      
      {/* Header */}
      <View style={visitorPassStyles.header}>
        <TouchableOpacity
          style={visitorPassStyles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={visitorPassStyles.headerTitle}>Visitor Pass</Text>
        <TouchableOpacity
          style={visitorPassStyles.shareButton}
          onPress={handleSharePass}
        >
          <Ionicons name="share-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={visitorPassStyles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Status Banner */}
        <View style={[visitorPassStyles.statusBanner, { backgroundColor: `${statusColor}10` }]}>
          <Ionicons name={statusIcon} size={20} color={statusColor} />
          <Text style={[visitorPassStyles.statusText, { color: statusColor }]}>
            {statusText}
          </Text>
        </View>

        {/* Virtual Access Card */}
        <Animated.View
          style={[
            visitorPassStyles.virtualCard,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Card Background with Gradient Effect */}
          <View style={visitorPassStyles.cardBackground}>
            <View style={visitorPassStyles.cardPattern} />
            
            {/* Card Header */}
            <View style={visitorPassStyles.cardHeader}>
              <View>
                <Text style={visitorPassStyles.cardTitle}>VISITOR ACCESS</Text>
                <Text style={visitorPassStyles.cardSubtitle}>Sapphire International Aviation Academy</Text>
              </View>
              <View style={visitorPassStyles.cardLogo}>
                <Ionicons name="airplane" size={24} color="#FFFFFF" />
              </View>
            </View>

            {/* Visitor ID Image or Initials */}
            <View style={visitorPassStyles.cardPhotoSection}>
              {visitor.idImage ? (
                <Image 
                  source={{ uri: visitor.idImage }} 
                  style={visitorPassStyles.cardPhoto} 
                />
              ) : (
                <View style={visitorPassStyles.cardInitials}>
                  <Text style={visitorPassStyles.cardInitialsText}>
                    {visitor.fullName?.split(' ').map(n => n[0]).join('') || 'V'}
                  </Text>
                </View>
              )}
            </View>

            {/* Visitor Name */}
            <Text style={visitorPassStyles.cardName}>{visitor.fullName}</Text>
            
            {/* Visitor ID */}
            <View style={visitorPassStyles.cardIdContainer}>
              <Text style={visitorPassStyles.cardIdLabel}>ID</Text>
              <Text style={visitorPassStyles.cardId}>
                {visitor._id?.slice(-8) || 'VIS-0000'}
              </Text>
            </View>

            {/* QR Code */}
            <TouchableOpacity 
              style={visitorPassStyles.qrContainer}
              onPress={() => setShowQRModal(true)}
            >
              <View style={visitorPassStyles.qrPlaceholder}>
                <Ionicons name="qr-code" size={60} color="#FFFFFF" />
              </View>
              <Text style={visitorPassStyles.qrText}>Tap to view QR code</Text>
            </TouchableOpacity>

            {/* Card Footer */}
            <View style={visitorPassStyles.cardFooter}>
              <View style={visitorPassStyles.cardFooterItem}>
                <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={visitorPassStyles.cardFooterText}>
                  {formatDate(visitor.visitDate)}
                </Text>
              </View>
              <View style={visitorPassStyles.cardFooterItem}>
                <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={visitorPassStyles.cardFooterText}>
                  {formatTime(visitor.visitTime)}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Quick Actions */}
        <View style={visitorPassStyles.quickActions}>
          <TouchableOpacity style={visitorPassStyles.quickAction} onPress={handleAddToWallet}>
            <View style={[visitorPassStyles.quickActionIcon, { backgroundColor: '#E3F2E9' }]}>
              <Ionicons name="wallet-outline" size={20} color="#10B981" />
            </View>
            <Text style={visitorPassStyles.quickActionText}>Add to Wallet</Text>
          </TouchableOpacity>

          <TouchableOpacity style={visitorPassStyles.quickAction} onPress={handleEmailPass}>
            <View style={[visitorPassStyles.quickActionIcon, { backgroundColor: '#F3E8FF' }]}>
              <Ionicons name="mail-outline" size={20} color="#1C6DD0" />
            </View>
            <Text style={visitorPassStyles.quickActionText}>Email Pass</Text>
          </TouchableOpacity>

          <TouchableOpacity style={visitorPassStyles.quickAction} onPress={() => setShowQRModal(true)}>
            <View style={[visitorPassStyles.quickActionIcon, { backgroundColor: '#E6F0FF' }]}>
              <Ionicons name="qr-code-outline" size={20} color="#0A3D91" />
            </View>
            <Text style={visitorPassStyles.quickActionText}>Show QR</Text>
          </TouchableOpacity>
        </View>

        {/* Appointment Details */}
        <View style={visitorPassStyles.detailsCard}>
          <View style={visitorPassStyles.detailsHeader}>
            <Ionicons name="calendar" size={20} color="#0A3D91" />
            <Text style={visitorPassStyles.detailsTitle}>Appointment Details</Text>
          </View>

          <View style={visitorPassStyles.detailsGrid}>
            <View style={visitorPassStyles.detailRow}>
              <Ionicons name="document-text-outline" size={18} color="#6B7280" />
              <Text style={visitorPassStyles.detailLabel}>Purpose:</Text>
              <Text style={visitorPassStyles.detailValue} numberOfLines={2}>
                {visitor.purposeOfVisit}
              </Text>
            </View>

            <View style={visitorPassStyles.detailRow}>
              <Ionicons name="calendar-outline" size={18} color="#6B7280" />
              <Text style={visitorPassStyles.detailLabel}>Date:</Text>
              <Text style={visitorPassStyles.detailValue}>
                {formatDate(visitor.visitDate)}
              </Text>
            </View>

            <View style={visitorPassStyles.detailRow}>
              <Ionicons name="time-outline" size={18} color="#6B7280" />
              <Text style={visitorPassStyles.detailLabel}>Time:</Text>
              <Text style={visitorPassStyles.detailValue}>
                {formatTime(visitor.visitTime)}
              </Text>
            </View>

            {visitor.vehicleNumber && (
              <View style={visitorPassStyles.detailRow}>
                <Ionicons name="car-outline" size={18} color="#6B7280" />
                <Text style={visitorPassStyles.detailLabel}>Vehicle:</Text>
                <Text style={visitorPassStyles.detailValue}>{visitor.vehicleNumber}</Text>
              </View>
            )}

            <View style={visitorPassStyles.detailRow}>
              <Ionicons name="time-outline" size={18} color="#6B7280" />
              <Text style={visitorPassStyles.detailLabel}>Registered:</Text>
              <Text style={visitorPassStyles.detailValue}>
                {formatDate(visitor.registeredAt)}
              </Text>
            </View>
          </View>
        </View>

        {/* Visitor Information */}
        <View style={visitorPassStyles.detailsCard}>
          <View style={visitorPassStyles.detailsHeader}>
            <Ionicons name="person-circle-outline" size={20} color="#0A3D91" />
            <Text style={visitorPassStyles.detailsTitle}>Visitor Information</Text>
          </View>

          <View style={visitorPassStyles.detailsGrid}>
            <View style={visitorPassStyles.detailRow}>
              <Ionicons name="call-outline" size={18} color="#6B7280" />
              <Text style={visitorPassStyles.detailLabel}>Phone:</Text>
              <Text style={visitorPassStyles.detailValue}>{visitor.phoneNumber}</Text>
            </View>

            <View style={visitorPassStyles.detailRow}>
              <Ionicons name="mail-outline" size={18} color="#6B7280" />
              <Text style={visitorPassStyles.detailLabel}>Email:</Text>
              <Text style={visitorPassStyles.detailValue}>{visitor.email}</Text>
            </View>

            <View style={visitorPassStyles.detailRow}>
              <Ionicons name="card-outline" size={18} color="#6B7280" />
              <Text style={visitorPassStyles.detailLabel}>ID Number:</Text>
              <Text style={visitorPassStyles.detailValue}>{visitor.idNumber}</Text>
            </View>
          </View>
        </View>

        {/* Check-in/out Information */}
        {(visitor.checkedInAt || visitor.checkedOutAt) && (
          <View style={visitorPassStyles.detailsCard}>
            <View style={visitorPassStyles.detailsHeader}>
              <Ionicons name="log-in-outline" size={20} color="#0A3D91" />
              <Text style={visitorPassStyles.detailsTitle}>Check-in/out History</Text>
            </View>

            <View style={visitorPassStyles.detailsGrid}>
              {visitor.checkedInAt && (
                <View style={visitorPassStyles.detailRow}>
                  <Ionicons name="log-in-outline" size={18} color="#10B981" />
                  <Text style={visitorPassStyles.detailLabel}>Checked In:</Text>
                  <Text style={visitorPassStyles.detailValue}>
                    {formatDate(visitor.checkedInAt)} at {formatTime(visitor.checkedInAt)}
                  </Text>
                </View>
              )}

              {visitor.checkedOutAt && (
                <View style={visitorPassStyles.detailRow}>
                  <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                  <Text style={visitorPassStyles.detailLabel}>Checked Out:</Text>
                  <Text style={visitorPassStyles.detailValue}>
                    {formatDate(visitor.checkedOutAt)} at {formatTime(visitor.checkedOutAt)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Important Notes */}
        <View style={visitorPassStyles.notesCard}>
          <Ionicons name="information-circle-outline" size={20} color="#6B7280" />
          <Text style={visitorPassStyles.notesText}>
            Please present this QR code at the security gate for entry. 
            Visitor pass is valid for the scheduled date and time only.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={visitorPassStyles.actionButtons}>
          <TouchableOpacity
            style={visitorPassStyles.primaryButton}
            onPress={() => navigation.navigate("VisitorRegister")}
          >
            <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
            <Text style={visitorPassStyles.primaryButtonText}>Register Another Visitor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={visitorPassStyles.secondaryButton}
            onPress={() => navigation.navigate("RoleSelect")}
          >
            <Text style={visitorPassStyles.secondaryButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowQRModal(false)}
      >
        <View style={visitorPassStyles.modalOverlay}>
          <View style={visitorPassStyles.modalContent}>
            <View style={visitorPassStyles.modalHeader}>
              <Text style={visitorPassStyles.modalTitle}>Your QR Code</Text>
              <TouchableOpacity onPress={() => setShowQRModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={visitorPassStyles.modalBody}>
              <View style={visitorPassStyles.largeQRPlaceholder}>
                <Ionicons name="qr-code" size={200} color="#0A3D91" />
              </View>
              
              <Text style={visitorPassStyles.qrVisitorName}>{visitor.fullName}</Text>
              <Text style={visitorPassStyles.qrVisitorId}>ID: {visitor._id?.slice(-8)}</Text>
              
              <View style={visitorPassStyles.qrDetails}>
                <View style={visitorPassStyles.qrDetailItem}>
                  <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                  <Text style={visitorPassStyles.qrDetailText}>
                    {formatDate(visitor.visitDate)}
                  </Text>
                </View>
                <View style={visitorPassStyles.qrDetailItem}>
                  <Ionicons name="time-outline" size={16} color="#6B7280" />
                  <Text style={visitorPassStyles.qrDetailText}>
                    {formatTime(visitor.visitTime)}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={visitorPassStyles.downloadQRButton}
                onPress={() => Alert.alert("✅ Success", "QR code saved to gallery")}
              >
                <Ionicons name="download-outline" size={20} color="#FFFFFF" />
                <Text style={visitorPassStyles.downloadQRText}>Download QR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
