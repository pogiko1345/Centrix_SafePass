import React, { useEffect, useState } from 'react';
import { AppState, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ApiService from '../utils/ApiService';
import { emitNotificationUpdate, subscribeNotificationLogout } from '../utils/notificationEvents';
import { startPushNotifications, clearDeliveredNotifications } from '../utils/pushNotifications';

export default function NotificationInbox({ currentUser }) {
  const [account, setAccount] = useState(null);
  const [notices, setNotices] = useState([]);
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState(null);
  useEffect(() => {
    let disposed = false, busy = false, userId = '', stopPush = () => {};
    let seen = new Set();
    const unsubscribeLogout = subscribeNotificationLogout(() => {
      disposed = true; stopPush();
      setAccount(null); setNotices([]); setBanner(null); setOpen(false);
      clearDeliveredNotifications().catch(() => {});
    });
    const refresh = async () => {
      if (disposed || busy || AppState.currentState === 'background') return;
      busy = true;
      try {
        const user = await ApiService.getCurrentUser();
        const nextId = String(user?._id || '');
        if (disposed) return;
        if (nextId !== userId) {
          stopPush();
          userId = nextId; seen = new Set();
          setAccount(user); setNotices([]); setBanner(null); setOpen(false);
          if (userId) stopPush = await startPushNotifications(ApiService, userId, (_data, opened) => {
            emitNotificationUpdate();
            if (opened) setOpen(true);
            refresh();
          });
          else clearDeliveredNotifications().catch(() => {});
        }
        if (!userId || disposed) return;
        const requestedUser = userId;
        const result = await ApiService.getNotifications({ read: 'false', limit: 100 });
        if (disposed || String((await ApiService.getCurrentUser())?._id || '') !== requestedUser) return;
        const rows = Array.isArray(result?.notifications) ? result.notifications : [];
        const fresh = rows.filter((notice) => !seen.has(String(notice._id)));
        rows.forEach((notice) => seen.add(String(notice._id)));
        setNotices(rows);
        if (fresh.length) { setBanner(fresh[0]); emitNotificationUpdate(); }
      } catch (error) {
        // Preserve the inbox during temporary loss of connectivity; retry on resume.
      } finally { busy = false; }
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { disposed = true; stopPush(); unsubscribeLogout(); clearInterval(timer); subscription.remove(); };
  }, [currentUser?._id]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(timer);
  }, [banner]);
  if (!account) return null;
  const read = async (notice) => {
    if (String((await ApiService.getCurrentUser())?._id) !== String(account._id)) return;
    try {
      await ApiService.markNotificationAsRead(notice._id);
      setNotices((rows) => rows.filter((row) => row._id !== notice._id));
      emitNotificationUpdate();
    } catch { /* Keep the unread item available for retry. */ }
  };
  return <>
    {banner && <TouchableOpacity accessibilityRole="button" onPress={() => { setBanner(null); setOpen(true); }}
      style={{ position: 'absolute', top: 48, left: 16, right: 16, padding: 16, backgroundColor: '#0A3D91', borderRadius: 12, elevation: 12, zIndex: 100 }}>
      <Text style={{ color: 'white', fontWeight: '700' }}>{banner.title}</Text>
      <Text numberOfLines={3} style={{ color: 'white', marginTop: 4 }}>{banner.message}</Text>
    </TouchableOpacity>}
    <TouchableOpacity accessibilityLabel="Open notifications" onPress={() => setOpen(true)}
      style={{ position: 'absolute', right: 16, bottom: 88, borderRadius: 24, backgroundColor: '#0A3D91', padding: 12, elevation: 6 }}>
      <Text style={{ color: 'white', fontWeight: '700' }}>Notifications{notices.length ? ` (${notices.length})` : ''}</Text>
    </TouchableOpacity>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: '#F8FAFC', paddingTop: 48, paddingHorizontal: 20, paddingBottom: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#0F172A' }}>Notifications</Text>
        <TouchableOpacity onPress={() => setOpen(false)} style={{ paddingVertical: 16 }}><Text style={{ color: '#0A3D91' }}>Close</Text></TouchableOpacity>
        <ScrollView>{notices.length === 0 && <Text>No unread notifications.</Text>}
          {notices.map((notice) => <View key={notice._id} style={{ backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12 }}>
            <Text style={{ fontWeight: '700', color: '#0F172A' }}>{notice.title}</Text>
            <Text style={{ marginVertical: 8, color: '#334155' }}>{notice.message}</Text>
            <TouchableOpacity onPress={() => read(notice)} style={{ paddingVertical: 8 }}><Text style={{ color: '#0A3D91' }}>Mark as read</Text></TouchableOpacity>
          </View>)}
        </ScrollView>
      </View>
    </Modal>
  </>;
}
