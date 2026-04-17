/**
 * Helper to register a background sync tag.
 * This is useful for deferring non-critical operations until the device is online.
 */
export async function registerBackgroundSync(tag = 'sync-data') {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
    console.warn('Background Sync is not supported in this browser.');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register(tag);
    console.log(`Background sync registered with tag: ${tag}`);
    return true;
  } catch (err) {
    console.error(`Background sync registration failed: ${err}`);
    return false;
  }
}

/**
 * Sets up a listener for messages from the service worker.
 * Useful for reacting to sync events or push notifications.
 */
export function setupServiceWorkerListener(onSync) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SYNC_TRIGGERED') {
        if (onSync) onSync(event.data.tag);
      }
    });
  }
}
