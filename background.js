// Background service worker for the Chrome extension
chrome.runtime.onInstalled.addListener(function() {
  console.log('GitHub PR Title Auto-filler extension installed');
});

// Handle storage changes and coordinate between content script and popup
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'sync' && changes.prTitleRules) {
    console.log('PR Title rules updated');
  }
});

// Optional: Add context menu or other background functionality in the future
chrome.action.onClicked.addListener(function(tab) {
  // This will open the popup, which is handled by the manifest
}); 