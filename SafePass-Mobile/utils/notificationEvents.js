const listeners = new Set();
const sessionListeners = new Set();
export const subscribeNotificationLogout = (listener) => {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
};
export const emitNotificationLogout = () => sessionListeners.forEach((listener) => listener());
export const subscribeNotificationUpdates = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const emitNotificationUpdate = () => {
  listeners.forEach((listener) => listener());
};
