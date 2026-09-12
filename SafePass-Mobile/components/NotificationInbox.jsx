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
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  useEffect(() => {
    let disposed = false, busy = false, userId = '', stopPush = () => {};
    let seen = new Set();
    const unsubscribeLogout = subscribeNotificationLogout(() => {
      disposed = true; stopPush();
      setAccount(null); setNotices([]); setBanner(null); setOpen(false); setHistory([]);
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
          setAccount(user); setNotices([]); setBanner(null); setOpen(false); setHistory([]);
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
  useEffect(() => {
    if (!open || !account?._id) return undefined;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError('');
    ApiService.getNotifications({ limit: 100 }).then(async (result) => {
      if (cancelled || String((await ApiService.getCurrentUser())?._id || '') !== String(account._id)) return;
      setHistory(Array.isArray(result?.notifications) ? result.notifications : []);
    }).catch(() => {
      if (!cancelled) setHistoryError('Could not load notifications. Please try again.');
    }).finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [open, account?._id]);
  if (!account) return null;
  const read = async (notice) => {
    if (String((await ApiService.getCurrentUser())?._id) !== String(account._id)) return;
    try {
      await ApiService.markNotificationAsRead(notice._id);
      setNotices((rows) => rows.filter((row) => row._id !== notice._id));
      setHistory((rows) => rows.map((row) => row._id === notice._id
        ? { ...row, readBy: [...(row.readBy || []), { user: account._id }] }
        : row));
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
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <View style={{ width: '100%', maxWidth: 520, maxHeight: '85%', backgroundColor: '#F8FAFC', borderRadius: 20, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#0F172A' }}>Notifications</Text>
              <Text style={{ color: '#64748B', marginTop: 4 }}>{notices.length} unread</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close notifications" onPress={() => setOpen(false)} style={{ padding: 10 }}>
              <Text style={{ color: '#0A3D91', fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            {historyLoading && !history.length ? <Text style={{ color: '#475569' }}>Loading notifications…</Text> : null}
            {historyError ? <Text style={{ color: '#B42318', marginBottom: 12 }}>{historyError}</Text> : null}
            {!historyLoading && !historyError && history.length === 0 ? <Text style={{ color: '#475569' }}>No notifications yet.</Text> : null}
            {history.map((notice) => {
              const unread = !notice.readBy?.some((entry) => String(entry.user?._id || entry.user) === String(account._id));
              return <View key={notice._id} style={{ backgroundColor: 'white', borderWidth: 1, borderColor: unread ? '#B8CFF5' : '#E2E8F0', padding: 16, borderRadius: 12, marginBottom: 10 }}>
                <Text style={{ fontWeight: '700', color: '#0F172A' }}>{notice.title}</Text>
                <Text style={{ marginTop: 6, color: '#334155', lineHeight: 20 }}>{notice.message}</Text>
                {unread ? <TouchableOpacity accessibilityRole="button" onPress={() => read(notice)} style={{ paddingTop: 12, paddingBottom: 4 }}>
                  <Text style={{ color: '#0A3D91', fontWeight: '700' }}>Mark as read</Text>
                </TouchableOpacity> : <Text style={{ color: '#64748B', marginTop: 10, fontSize: 12 }}>Read</Text>}
              </View>;
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
