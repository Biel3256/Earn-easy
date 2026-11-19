export type BrowserNotificationPermissionState = NotificationPermission | 'unsupported';

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission(): BrowserNotificationPermissionState {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  try {
    return window.Notification.permission;
  } catch {
    return 'unsupported';
  }
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  try {
    const result = await window.Notification.requestPermission();
    return result;
  } catch {
    return getBrowserNotificationPermission();
  }
}

export function sendBrowserNotification(params: {
  title: string;
  body: string;
  tag?: string;
  onClick?: () => void;
}): boolean {
  if (!isBrowserNotificationSupported()) return false;
  try {
    if (window.Notification.permission !== 'granted') return false;
    const notification = new window.Notification(params.title, {
      body: params.body,
      tag: params.tag,
    });
    notification.onclick = () => {
      try {
        window.focus();
        params.onClick?.();
        notification.close();
      } catch {
        // Ignore focus/close errors in sandboxed frames
      }
    };
    return true;
  } catch {
    return false;
  }
}
