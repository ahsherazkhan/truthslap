// Background script for LinkedIn Post Extractor
console.log("LinkedIn Post Extractor: Background script initialized");

// Initialize the extension's enabled state when installed
chrome.runtime.onInstalled.addListener(function() {
  // Set default state to enabled
  chrome.storage.sync.set({enabled: true}, function() {
    console.log('Extension initialized with enabled state: true');
  });
});

// This background script initializes the extension state
// It could be expanded to handle auto-scanning when LinkedIn tabs are loaded
// or to manage notifications about extracted posts
