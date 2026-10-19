// KINO Popup Shield — background service worker
// Kills any outbound popup tabs spawned from the KINO player instantly

chrome.tabs.onCreated.addListener(async (tab) => {
  if (!tab.openerTabId) return;

  try {
    const opener = await chrome.tabs.get(tab.openerTabId);
    const openerUrl = opener.url || opener.pendingUrl || '';

    // Check if the tab was triggered from KINO player
    const isFromKino = openerUrl.includes('127.0.0.1:3000') || openerUrl.includes('localhost:3000');
    if (!isFromKino) return;

    // Check target URL
    const targetUrl = tab.url || tab.pendingUrl || '';
    const isLocalKino = targetUrl.includes('127.0.0.1:3000') || targetUrl.includes('localhost:3000');

    // Destroy external popup immediately before it renders
    if (!isLocalKino && tab.id) {
      chrome.tabs.remove(tab.id);
    }
  } catch (_) {
    // Opener closed or tab destroyed
  }
});
