let queue = [];
let sequence = 0;
const listeners = new Set();
const publish = () => listeners.forEach(listener => listener());

export const subscribeAlerts = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getCurrentAlert = () => queue[0] || null;

const Alert = {
  alert(title, message, buttons, options = {}) {
    queue = [...queue, {
      id: ++sequence, title: String(title || ''), message: String(message || ''), options,
      buttons: buttons?.length ? buttons : [{ text: 'OK' }],
    }];
    publish();
  },
};

export function dismissAlert(id, buttonIndex = null) {
  const current = getCurrentAlert();
  if (!current || current.id !== id) return;
  // Remove first: repeated clicks cannot run an operation twice.
  queue = queue.slice(1);
  publish();
  const callback = buttonIndex == null ? current.options.onDismiss : current.buttons[buttonIndex]?.onPress;
  try {
    Promise.resolve(callback?.()).catch(() => Alert.alert('Action failed', 'Please try again.'));
  } catch {
    Alert.alert('Action failed', 'Please try again.');
  }
}

export default Alert;
