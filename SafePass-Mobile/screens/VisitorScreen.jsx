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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ApiService from "../utils/ApiService";
import visitorScreenStyles from "../styles/VisitorScreenStyles";

const SCHOOL_LOGO = require("../assets/LogoSapphire.jpg");

export default function VisitorScreen({ navigation, route }) {
  const { visitorId } = route?.params || {};
  
  const [visitor, setVisitor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const cardRotate = useRef(new Animated.Value(0)).current;

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

    loadVisitorData();
  }, [visitorId]);

  const loadVisitorData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Try to get from storage first
      const cachedVisitor = await AsyncStorage.getItem('currentVisitor');
      
      if (visitorId) {
        // Fetch specific visitor by ID
        const response = await ApiService.getVisitorById(visitorId);
        if (response.success) {
          setVisitor(response.visitor);
          await AsyncStorage.setItem('currentVisitor', JSON.stringify(response.visitor));
        }
      } else {
        // Try to get from registration response
        const registrationData = await AsyncStorage.getItem('lastRegistration');
        if (registrationData) {
          setVisitor(JSON.parse(registrationData));
        } else {
          // Demo data for preview
          setVisitor({
            id: "VIS-123456",
            fullName: "John Smith",
            email: "john.smith@email.com",
            phoneNumber: "0912 345 6789",
            idNumber: "PASSPORT-12345",
            purposeOfVisit: "Campus Tour & Meeting with Admissions",
            vehicleNumber: "ABC-1234",
            visitDate: new Date().toISOString(),
            visitTime: new Date().toISOString(),
            status: "confirmed",
            qrCode: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=VIS-123456",
            host: "Dr. Maria Santos",
            department: "Admissions Office",
            validUntil: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours from now
          });
        }
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
    loadVisitorData();
  };

  const handleSharePass = async () => {
    try {
      await Share.share({
        message: `Visitor Pass for ${visitor.fullName}\nID: ${visitor.id}\nValid Until: ${formatDate(visitor.validUntil)}`,
        title: 'Visitor Pass',
      });
    } catch (error) {
      Alert.alert("Error", "Failed to share pass");
    }
  };

  const handleAddToWallet = () => {
    Alert.alert(
      "Add to Wallet",
      "This will add your visitor pass to Apple Wallet / Google Pay",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Add", onPress: () => Alert.alert("Success", "Pass added to wallet") }
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

  const getTimeRemaining = () => {
    if (!visitor?.validUntil) return null;
    
    const now = new Date();
    const validUntil = new Date(visitor.validUntil);
    const diffMs = validUntil - now;
    
    if (diffMs <= 0) return 'Expired';
    
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${diffHrs}h ${diffMins}m remaining`;
  };

  const getStatusColor = () => {
    if (!visitor?.validUntil) return '#F59E0B';
    const now = new Date();
    const validUntil = new Date(visitor.validUntil);
    
    if (validUntil < now) return '#EF4444';
    if (validUntil < new Date(now.getTime() + 2 * 60 * 60 * 1000)) return '#F59E0B';
    return '#10B981';
  };

  const getStatusText = () => {
    if (!visitor?.validUntil) return 'Pending';
    const now = new Date();
    const validUntil = new Date(visitor.validUntil);
    
    if (validUntil < now) return 'Expired';
    if (validUntil < new Date(now.getTime() + 2 * 60 * 60 * 1000)) return 'Expiring Soon';
    return 'Active';
  };

  if (isLoading && !visitor) {
    return (
      <SafeAreaView style={visitorScreenStyles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0A3D91" />
        <Image source={SCHOOL_LOGO} resizeMode="contain" style={{ width: 116, height: 58, marginBottom: 18 }} />
        <ActivityIndicator size="large" color="#0A3D91" />
        <Text style={visitorScreenStyles.loadingText}>Loading your visitor pass...</Text>
      </SafeAreaView>
    );
  }

  if (error && !visitor) {
    return (
      <SafeAreaView style={visitorScreenStyles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0A3D91" />
        <View style={visitorScreenStyles.header}>
          <TouchableOpacity
            style={visitorScreenStyles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={visitorScreenStyles.headerTitle}>Visitor Pass</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={visitorScreenStyles.errorContent}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <Text style={visitorScreenStyles.errorTitle}>Something went wrong</Text>
          <Text style={visitorScreenStyles.errorMessage}>{error}</Text>
          <TouchableOpacity style={visitorScreenStyles.retryButton} onPress={loadVisitorData}>
            <Text style={visitorScreenStyles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!visitor) {
    return (
      <SafeAreaView style={visitorScreenStyles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0A3D91" />
        <View style={visitorScreenStyles.header}>
          <TouchableOpacity
            style={visitorScreenStyles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={visitorScreenStyles.headerTitle}>Visitor Pass</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={visitorScreenStyles.errorContent}>
          <Ionicons name="id-card-outline" size={64} color="#9CA3AF" />
          <Text style={visitorScreenStyles.errorMessage}>No visitor pass found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor();
  const statusText = getStatusText();
  const timeRemaining = getTimeRemaining();

  return (
    <SafeAreaView style={visitorScreenStyles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0A3D91" />
      
      {/* Header */}
      <View style={visitorScreenStyles.header}>
        <TouchableOpacity
          style={visitorScreenStyles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={visitorScreenStyles.headerTitle}>Visitor Pass</Text>
        <TouchableOpacity
          style={visitorScreenStyles.shareButton}
          onPress={handleSharePass}
        >
          <Ionicons name="share-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={visitorScreenStyles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Status Banner */}
        <View style={[visitorScreenStyles.statusBanner, { backgroundColor: `${statusColor}10` }]}>
          <View style={[visitorScreenStyles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[visitorScreenStyles.statusText, { color: statusColor }]}>
            {statusText} • {timeRemaining || 'Valid'}
          </Text>
        </View>

        {/* Virtual Access Card */}
        <Animated.View
          style={[
            visitorScreenStyles.virtualCard,
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                {
                  rotateY: cardRotate.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg'],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Card Background with Gradient Effect */}
          <View style={visitorScreenStyles.cardBackground}>
            <View style={visitorScreenStyles.cardPattern} />
            
            {/* Card Header */}
            <View style={visitorScreenStyles.cardHeader}>
              <View>
                <Text style={visitorScreenStyles.cardTitle}>VISITOR ACCESS</Text>
                <Text style={visitorScreenStyles.cardSubtitle}>Sapphire International Aviation Academy</Text>
              </View>
              <View style={visitorScreenStyles.cardLogo}>
                <Ionicons name="airplane" size={24} color="#FFFFFF" />
              </View>
            </View>

            {/* Visitor Photo/Initials */}
            <View style={visitorScreenStyles.cardPhotoSection}>
              {visitor.idPhoto ? (
                <Image source={{ uri: visitor.idPhoto }} style={visitorScreenStyles.cardPhoto} />
              ) : (
                <View style={visitorScreenStyles.cardInitials}>
                  <Text style={visitorScreenStyles.cardInitialsText}>
                    {visitor.fullName?.split(' ').map(n => n[0]).join('') || 'V'}
                  </Text>
                </View>
              )}
            </View>

            {/* Visitor Name */}
            <Text style={visitorScreenStyles.cardName}>{visitor.fullName}</Text>
            
            {/* Visitor ID */}
            <View style={visitorScreenStyles.cardIdContainer}>
              <Text style={visitorScreenStyles.cardIdLabel}>ID</Text>
              <Text style={visitorScreenStyles.cardId}>{visitor.id || 'VIS-' + Math.random().toString(36).substring(2, 10).toUpperCase()}</Text>
            </View>

            {/* QR Code Placeholder */}
            <View style={visitorScreenStyles.qrContainer}>
              <View style={visitorScreenStyles.qrPlaceholder}>
                <Ionicons name="qr-code" size={60} color="#FFFFFF" />
              </View>
            </View>

            {/* Card Footer */}
            <View style={visitorScreenStyles.cardFooter}>
              <View style={visitorScreenStyles.cardFooterItem}>
                <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={visitorScreenStyles.cardFooterText}>
                  {formatDate(visitor.visitDate)}
                </Text>
              </View>
              <View style={visitorScreenStyles.cardFooterItem}>
                <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={visitorScreenStyles.cardFooterText}>
                  {formatTime(visitor.visitTime)}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Quick Actions */}
        <View style={visitorScreenStyles.quickActions}>
          <TouchableOpacity style={visitorScreenStyles.quickAction} onPress={handleAddToWallet}>
            <View style={[visitorScreenStyles.quickActionIcon, { backgroundColor: '#E3F2E9' }]}>
              <Ionicons name="wallet-outline" size={20} color="#10B981" />
            </View>
            <Text style={visitorScreenStyles.quickActionText}>Add to Wallet</Text>
          </TouchableOpacity>

          <TouchableOpacity style={visitorScreenStyles.quickAction} onPress={() => Alert.alert("Download", "Downloading pass as PDF")}>
            <View style={[visitorScreenStyles.quickActionIcon, { backgroundColor: '#E6F0FF' }]}>
              <Ionicons name="download-outline" size={20} color="#0A3D91" />
            </View>
            <Text style={visitorScreenStyles.quickActionText}>Download</Text>
          </TouchableOpacity>

          <TouchableOpacity style={visitorScreenStyles.quickAction} onPress={() => Alert.alert("Email", "Sending pass to your email")}>
            <View style={[visitorScreenStyles.quickActionIcon, { backgroundColor: '#F3E8FF' }]}>
              <Ionicons name="mail-outline" size={20} color="#1C6DD0" />
            </View>
            <Text style={visitorScreenStyles.quickActionText}>Email</Text>
          </TouchableOpacity>
        </View>

        {/* Appointment Details */}
        <View style={visitorScreenStyles.detailsCard}>
          <View style={visitorScreenStyles.detailsHeader}>
            <Ionicons name="calendar" size={20} color="#0A3D91" />
            <Text style={visitorScreenStyles.detailsTitle}>Appointment Details</Text>
          </View>

          <View style={visitorScreenStyles.detailsGrid}>
            <View style={visitorScreenStyles.detailRow}>
              <Ionicons name="person-outline" size={18} color="#6B7280" />
              <Text style={visitorScreenStyles.detailLabel}>Host:</Text>
              <Text style={visitorScreenStyles.detailValue}>{visitor.host || 'Dr. Maria Santos'}</Text>
            </View>

            <View style={visitorScreenStyles.detailRow}>
              <Ionicons name="business-outline" size={18} color="#6B7280" />
              <Text style={visitorScreenStyles.detailLabel}>Department:</Text>
              <Text style={visitorScreenStyles.detailValue}>{visitor.department || 'Admissions Office'}</Text>
            </View>

            <View style={visitorScreenStyles.detailRow}>
              <Ionicons name="document-text-outline" size={18} color="#6B7280" />
              <Text style={visitorScreenStyles.detailLabel}>Purpose:</Text>
              <Text style={visitorScreenStyles.detailValue} numberOfLines={2}>
                {visitor.purposeOfVisit}
              </Text>
            </View>

            <View style={visitorScreenStyles.detailRow}>
              <Ionicons name="time-outline" size={18} color="#6B7280" />
              <Text style={visitorScreenStyles.detailLabel}>Check-in:</Text>
              <Text style={visitorScreenStyles.detailValue}>
                {visitor.checkInTime ? formatTime(visitor.checkInTime) : 'Not checked in'}
              </Text>
            </View>

            <View style={visitorScreenStyles.detailRow}>
              <Ionicons name="time-outline" size={18} color="#6B7280" />
              <Text style={visitorScreenStyles.detailLabel}>Valid Until:</Text>
              <Text style={[visitorScreenStyles.detailValue, { color: statusColor }]}>
                {formatTime(visitor.validUntil)} • {formatDate(visitor.validUntil)}
              </Text>
            </View>
          </View>
        </View>

        {/* Visitor Information */}
        <View style={visitorScreenStyles.detailsCard}>
          <View style={visitorScreenStyles.detailsHeader}>
            <Ionicons name="person-circle-outline" size={20} color="#0A3D91" />
            <Text style={visitorScreenStyles.detailsTitle}>Visitor Information</Text>
          </View>

          <View style={visitorScreenStyles.detailsGrid}>
            <View style={visitorScreenStyles.detailRow}>
              <Ionicons name="call-outline" size={18} color="#6B7280" />
              <Text style={visitorScreenStyles.detailLabel}>Phone:</Text>
              <Text style={visitorScreenStyles.detailValue}>{visitor.phoneNumber}</Text>
            </View>

            <View style={visitorScreenStyles.detailRow}>
              <Ionicons name="mail-outline" size={18} color="#6B7280" />
              <Text style={visitorScreenStyles.detailLabel}>Email:</Text>
              <Text style={visitorScreenStyles.detailValue}>{visitor.email}</Text>
            </View>

            <View style={visitorScreenStyles.detailRow}>
              <Ionicons name="card-outline" size={18} color="#6B7280" />
              <Text style={visitorScreenStyles.detailLabel}>ID Number:</Text>
              <Text style={visitorScreenStyles.detailValue}>{visitor.idNumber}</Text>
            </View>

            {visitor.vehicleNumber && (
              <View style={visitorScreenStyles.detailRow}>
                <Ionicons name="car-outline" size={18} color="#6B7280" />
                <Text style={visitorScreenStyles.detailLabel}>Vehicle:</Text>
                <Text style={visitorScreenStyles.detailValue}>{visitor.vehicleNumber}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Important Notes */}
        <View style={visitorScreenStyles.notesCard}>
          <Ionicons name="information-circle-outline" size={20} color="#6B7280" />
          <Text style={visitorScreenStyles.notesText}>
            Please present this QR code at the security gate for entry. Visitor pass is valid for 24 hours from the time of registration.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={visitorScreenStyles.actionButtons}>
          <TouchableOpacity
            style={visitorScreenStyles.primaryButton}
            onPress={() => navigation.navigate("VisitorRegister")}
          >
            <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
            <Text style={visitorScreenStyles.primaryButtonText}>Register Another Visitor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={visitorScreenStyles.secondaryButton}
            onPress={() => navigation.navigate("Home")}
          >
            <Text style={visitorScreenStyles.secondaryButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
