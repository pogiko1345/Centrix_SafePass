import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Foreground notices are shown by the shared in-app inbox, avoiding two banners.
Notifications.setNotificationHandler({ handleNotification: async () => ({
  shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
}) });

export async function clearDeliveredNotifications() {
  await Notifications.dismissAllNotificationsAsync();
  await Notifications.clearLastNotificationResponseAsync();
}

export async function startPushNotifications(api, userId, onNotice) {
  if (!Constants.expoConfig?.extra?.pushNotificationsConfigured) return () => {};
  let disposed = false;
  let registrationInFlight = false;
  let registered = false;
  const notify = (notification, opened = false) => {
    const data = notification?.request?.content?.data;
    if (!disposed && String(data?.recipientUserId || '') === String(userId)) onNotice(data, opened);
  };
  const received = Notifications.addNotificationReceivedListener(notify);
  const response = Notifications.addNotificationResponseReceivedListener((event) => notify(event.notification, true));
  const registerDevice = async () => {
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('campus-updates', {
      name: 'Campus updates', importance: Notifications.AndroidImportance.HIGH,
    });
    let permission = await Notifications.getPermissionsAsync();
    if (permission.status === 'undetermined') permission = await Notifications.requestPermissionsAsync();
    if (disposed) return false;
    if (!permission.granted) {
      const token = await AsyncStorage.getItem('pushDeviceToken');
      if (token) {
        await api.fetch('/notifications/device', { method: 'DELETE', body: { token } });
        await AsyncStorage.removeItem('pushDeviceToken');
      }
      return false;
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (disposed || String((await api.getCurrentUser())?._id) !== String(userId)) return;
    await api.fetch('/notifications/device', { method: 'PUT', body: { token, platform: Platform.OS } });
    await AsyncStorage.setItem('pushDeviceToken', token);
    return true;
  };
  const register = async () => {
    if (disposed || registrationInFlight) return;
    registrationInFlight = true;
    try { registered = await registerDevice(); }
    finally { registrationInFlight = false; }
  };
  const retry = setInterval(() => {
    if (!registered && AppState.currentState === 'active') register().catch(() => {});
  }, 60000);
  const resume = AppState.addEventListener('change', (state) => {
    if (state === 'active') register().catch(() => {});
  });
  const rotation = Notifications.addPushTokenListener(() => register().catch(() => {}));
  // Credential or network errors must not prevent signing in or reading the inbox.
  register().catch((error) => console.warn('Push registration unavailable:', error.message));
  Notifications.getLastNotificationResponseAsync().then((event) => {
    if (event) notify(event.notification, true);
    return Notifications.clearLastNotificationResponseAsync();
  }).catch(() => {});
  return () => { disposed = true; clearInterval(retry); resume.remove(); received.remove(); response.remove(); rotation.remove(); };
}
