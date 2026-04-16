/* 
  HabiTick Service Worker 
  Handles background push notifications for TWA/PWA
*/

self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body || 'You have a reminder from HabiTick!',
        icon: '/habitick-blue-logo.png', // Ensure this matches your logo path
        badge: '/habitick-blue-logo.png',
        vibrate: [100, 50, 100],
        data: {
          url: data.url || '/'
        },
        actions: [
          { action: 'open', title: 'Open HabiTick' }
        ]
      };

      event.waitUntil(
        self.registration.showNotification(data.title || 'HabiTick Reminder', options)
      );
    } catch (e) {
      console.error('Error parsing push data', e);
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const urlToOpen = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a window is already open, focus it
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
