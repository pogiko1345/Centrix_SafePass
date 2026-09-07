const audienceQuery = notification => {
  const query = { isActive: { $ne: false }, status: { $nin: ['inactive', 'suspended'] } };
  const role = notification.targetRole || 'all';
  if (role !== 'all') query.role = ['guard', 'security'].includes(role) ? { $in: ['guard', 'security'] } : role;
  if (notification.targetUser) query._id = notification.targetUser;
  return query;
};

const pushMessage = (notification, delivery) => ({
  to: delivery.token,
  title: String(notification.title).slice(0, 160),
  body: String(notification.message).slice(0, 1000),
  sound: 'default',
  channelId: 'campus-updates',
  priority: 'high',
  data: {
    notificationId: String(notification._id),
    recipientUserId: String(delivery.user),
    relatedVisitorId: notification.relatedVisitor ? String(notification.relatedVisitor) : null,
    activityType: String(notification.metadata?.activityType || ''),
  },
});

function createPushWorker({ Notification, User, PushDevice, PushDelivery, fetchImpl = global.fetch, now = () => new Date() }) {
  let running = false;
  const expoRequest = async (path, body) => {
    const response = await fetchImpl(`https://exp.host/--/api/v2/push/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Expo push HTTP ${response.status}`);
    const result = await response.json();
    if (result.errors?.length) throw new Error(String(result.errors[0].code || 'Expo push error'));
    return result.data;
  };
  const retryOrFail = async (delivery, reason) => {
    const permanent = ['DeviceNotRegistered', 'MessageTooBig', 'InvalidCredentials', 'MismatchSenderId'].includes(reason);
    if (reason === 'DeviceNotRegistered') await PushDevice.deleteOne({ token: delivery.token, user: delivery.user });
    await PushDelivery.updateOne({ _id: delivery._id }, { $set: {
      status: permanent || delivery.attempts >= 5 ? 'failed' : 'pending',
      lastError: String(reason).slice(0, 200),
      nextAttemptAt: new Date(now().getTime() + Math.min(3600000, 30000 * 2 ** delivery.attempts)),
      lockedUntil: new Date(0),
    } });
  };
  const runOnce = async () => {
    if (running) return;
    running = true;
    try {
      // The explicit false filter excludes old records predating push support.
      const notifications = await Notification.find({ pushQueued: false, $or: [{ expiresAt: null }, { expiresAt: { $gt: now() } }] }).sort({ createdAt: 1 }).limit(30).lean();
      for (const notification of notifications) {
        const users = await User.find(audienceQuery(notification)).select('_id').lean();
        const devices = await PushDevice.find({ user: { $in: users.map(u => u._id) } }).lean();
        for (const device of devices) {
          await PushDelivery.updateOne({ notification: notification._id, token: device.token }, { $setOnInsert: {
            notification: notification._id, token: device.token, user: device.user,
            expiresAt: notification.expiresAt || new Date(now().getTime() + 7 * 86400000),
          } }, { upsert: true, setDefaultsOnInsert: true });
        }
        await Notification.updateOne({ _id: notification._id }, { $set: { pushQueued: true } });
      }
      for (let i = 0; i < 20; i++) {
        const delivery = await PushDelivery.findOneAndUpdate({
          status: { $in: ['pending', 'ticketed'] }, nextAttemptAt: { $lte: now() }, lockedUntil: { $lte: now() }, expiresAt: { $gt: now() },
        }, { $set: { lockedUntil: new Date(now().getTime() + 60000) }, $inc: { attempts: 1 } }, { new: true, sort: { nextAttemptAt: 1 } });
        if (!delivery) break;
        try {
          if (delivery.status === 'ticketed') {
            const receipts = await expoRequest('getReceipts', { ids: [delivery.ticketId] });
            const receipt = receipts?.[delivery.ticketId];
            if (receipt?.status === 'ok') {
              await PushDelivery.updateOne({ _id: delivery._id }, { $set: { status: 'delivered', lockedUntil: new Date(0) } });
            } else if (receipt?.status === 'error') {
              await retryOrFail(delivery, receipt.details?.error || 'ReceiptError');
            } else {
              await PushDelivery.updateOne({ _id: delivery._id }, { $set: {
                status: delivery.attempts >= 12 ? 'failed' : 'ticketed',
                lastError: 'Receipt not available', nextAttemptAt: new Date(now().getTime() + 15 * 60000), lockedUntil: new Date(0),
              } });
            }
            continue;
          }
          const notification = await Notification.findById(delivery.notification).lean();
          const device = await PushDevice.findOne({ token: delivery.token, user: delivery.user }).lean();
          const recipient = notification && await User.findOne({ $and: [audienceQuery(notification), { _id: delivery.user }] }).select('_id').lean();
          // Recheck ownership after logout/account switching and role changes.
          if (!notification || !device || !recipient) {
            await PushDelivery.updateOne({ _id: delivery._id }, { $set: { status: 'failed', lastError: 'Recipient unavailable', lockedUntil: new Date(0) } });
            continue;
          }
          const tickets = await expoRequest('send', [pushMessage(notification, delivery)]);
          const ticket = tickets?.[0];
          if (ticket?.status === 'ok' && ticket.id) {
            await PushDelivery.updateOne({ _id: delivery._id }, { $set: { status: 'ticketed', ticketId: ticket.id, nextAttemptAt: new Date(now().getTime() + 15 * 60000), lockedUntil: new Date(0) } });
          } else await retryOrFail(delivery, ticket?.details?.error || 'PushRejected');
        } catch (error) {
          if (delivery.status === 'ticketed') {
            // A receipt outage must not resend a message already accepted by Expo.
            await PushDelivery.updateOne({ _id: delivery._id }, { $set: { lockedUntil: new Date(0), nextAttemptAt: new Date(now().getTime() + 15 * 60000), lastError: 'Receipt request failed' } });
          } else await retryOrFail(delivery, error.message);
        }
      }
    } finally { running = false; }
  };
  return { runOnce };
}

module.exports = { audienceQuery, pushMessage, createPushWorker };
