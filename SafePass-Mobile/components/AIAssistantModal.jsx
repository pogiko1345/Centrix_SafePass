import Alert from '../utils/Alert';
// components/AIAssistantModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
} from "react-native";
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AIService from '../utils/AIService';
import aiAssistantStyles from '../styles/AIAssistantStyles';

export default function AIAssistantModal({ visible, onClose, onFillForm, currentFormData }) {
  const [step, setStep] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [extractedData, setExtractedData] = useState({});
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scrollViewRef = useRef(null);
  
  const fields = [
    { key: 'fullName', label: 'Full Name', question: "What's your full name?" },
    { key: 'email', label: 'Email Address', question: "What's your email address?" },
    { key: 'phoneNumber', label: 'Phone Number', question: "What's your mobile number?" },
    { key: 'idNumber', label: 'ID Number', question: "What's your ID number (passport/driver's license)?" },
    { key: 'purposeOfVisit', label: 'Purpose of Visit', question: "What's the purpose of your visit?" },
    { key: 'vehicleNumber', label: 'Vehicle Number', question: "Do you have a vehicle? If yes, what's the plate number?" },
  ];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== "web" }),
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: Platform.OS !== "web" }),
      ]).start();
      
      setStep(0);
      setUserInput('');
      setExtractedData({});
      setConversation([{
        role: 'assistant',
        message: "👋 Hi! I'm your AI assistant. I can help you fill out the registration form quickly.\n\nYou can either:\n• Type your information\n• Or upload a photo of your ID\n\nLet's start! What's your full name?"
      }]);
    }
  }, [visible]);

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;
    
    const userMessage = { role: 'user', message: userInput };
    setConversation(prev => [...prev, userMessage]);
    setUserInput('');
    setIsProcessing(true);
    
    try {
      const extracted = await AIService.smartFillForm(userInput);
      const updatedData = { ...extractedData, ...extracted };
      setExtractedData(updatedData);
      
      let aiResponse = '';
      let nextStep = step;
      
      if (extracted.fullName && step === 0) {
        aiResponse = `✅ Got it! Your name is ${extracted.fullName}.\n\nNext, what's your email address?`;
        nextStep = 1;
      } else if (extracted.email && step === 1) {
        aiResponse = `✅ Email recorded: ${extracted.email}\n\nWhat's your mobile number?`;
        nextStep = 2;
      } else if (extracted.phoneNumber && step === 2) {
        aiResponse = `✅ Phone number saved: ${extracted.phoneNumber}\n\nWhat's your ID number (passport/driver's license)?`;
        nextStep = 3;
      } else if (extracted.idNumber && step === 3) {
        aiResponse = `✅ ID number recorded.\n\nWhat's the purpose of your visit?`;
        nextStep = 4;
      } else if (extracted.purpose && step === 4) {
        aiResponse = `✅ Purpose: ${extracted.purpose}\n\nDo you have a vehicle? (If yes, please provide the plate number)`;
        nextStep = 5;
      } else if ((extracted.vehicleNumber || userInput.toLowerCase().includes('no vehicle')) && step === 5) {
        const vehicleNumber = extracted.vehicleNumber || (userInput.toLowerCase().includes('no') ? '' : userInput);
        aiResponse = `✅ All information collected!\n\nI'll now fill out the registration form for you.`;
        nextStep = 6;
      } else {
        const currentField = fields[step];
        aiResponse = `I need your ${currentField.label}. Could you please provide that?`;
      }
      
      if (aiResponse) {
        setConversation(prev => [...prev, { role: 'assistant', message: aiResponse }]);
      }
      
      setStep(nextStep);
      
      if (nextStep === 6) {
        setTimeout(() => {
          onFillForm(extractedData);
          onClose();
          Alert.alert(
            '✅ Form Filled!',
            'Your information has been auto-filled. Please review and submit.',
            [{ text: 'OK' }]
          );
        }, 1500);
      }
      
    } catch (error) {
      console.error('AI processing error:', error);
      setConversation(prev => [...prev, { 
        role: 'assistant', 
        message: "I'm having trouble understanding. Could you please rephrase that?" 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUploadID = async () => {
    Alert.alert(
      'ID Card Scanner',
      'This feature will scan your ID card and extract information.\n\nComing soon!',
      [{ text: 'OK' }]
    );
  };

  const handleAutoFill = () => {
    const demoData = {
      fullName: 'John Michael Smith',
      email: 'john.smith@email.com',
      phoneNumber: '09123456789',
      idNumber: 'PASSPORT-123456789',
      purposeOfVisit: 'Campus Tour and Meeting',
      vehicleNumber: 'ABC-1234',
    };
    onFillForm(demoData);
    onClose();
    Alert.alert('✅ Demo Data Filled', 'Sample data has been filled for testing.');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none" Scott scroll up no chicken cristianes really thousand they red new plots times
      onRequestClose={onClose}
    >
      <Animated.View style={[aiAssistantStyles.modalOverlay, { opacity: fadeAnim }]}>
        <Animated.View style={[aiAssistantStyles.modalContainer, { transform: [{ translateY: slideAnim }] }]}>
          {/* Header */}
          <LinearGradient
            colors={['#0A3D91', '#1C6DD0']}
            style={aiAssistantStyles.header}
          >
            <View style={aiAssistantStyles.headerContent}>
              <Ionicons name="chatbubble-ellipses" size={28} color="#FFFFFF" />
              <Text style={aiAssistantStyles.headerTitle}>AI Assistant</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={aiAssistantStyles.closeButton}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </LinearGradient>

          {/* Quick Actions */}
          <View style={aiAssistantStyles.quickActions}>
            <TouchableOpacity style={aiAssistantStyles.quickAction} onPress={handleUploadID}>
              <Ionicons name="camera" size={20} color="#0A3D91" />
              <Text style={aiAssistantStyles.quickActionText}>Scan ID</Text>
            </TouchableOpacity>
            <TouchableOpacity style={aiAssistantStyles.quickAction} onPress={handleAutoFill}>
              <Ionicons name="flash" size={20} color="#0A3D91" />
              <Text style={aiAssistantStyles.quickActionText}>Demo Fill</Text>
            </TouchableOpacity>
          </View>

          {/* Conversation */}
          <ScrollView 
            style={aiAssistantStyles.conversationContainer}
            ref={scrollViewRef}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {conversation.map((msg, index) => (
              <View
                key={index}
                style={[
                  aiAssistantStyles.messageBubble,
                  msg.role === 'assistant' ? aiAssistantStyles.assistantBubble : aiAssistantStyles.userBubble
                ]}
              >
                {msg.role === 'assistant' && (
                  <View style={aiAssistantStyles.assistantIcon}>
                    <Ionicons name="chatbubble" size={16} color="#0A3D91" />
                  </View>
                )}
                <Text style={[
                  aiAssistantStyles.messageText,
                  msg.role === 'user' && aiAssistantStyles.userMessageText
                ]}>
                  {msg.message}
                </Text>
              </View>
            ))}
            {isProcessing && (
              <View style={aiAssistantStyles.loadingBubble}>
                <ActivityIndicator size="small" color="#0A3D91" />
                <Text style={aiAssistantStyles.loadingText}>AI is thinking...</Text>
              </View>
            )}
          </ScrollView>

          {/* Input Area */}
          <View style={aiAssistantStyles.inputContainer}>
            <TextInput
              style={aiAssistantStyles.input}
              placeholder="Type your response here..."
              placeholderTextColor="#9CA3AF"
              value={userInput}
              onChangeText={setUserInput}
              multiline
              editable={!isProcessing && step < 6}
            />
            <TouchableOpacity
              style={[
                aiAssistantStyles.sendButton,
                (!userInput.trim() || isProcessing) && aiAssistantStyles.sendButtonDisabled
              ]}
              onPress={handleSendMessage}
              disabled={!userInput.trim() || isProcessing}
            >
              <Ionicons name="send" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
