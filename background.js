// Handles messages sent from the popup (or potentially other parts of the extension)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Fetch the current focus mode state from storage
  chrome.storage.sync.get(['focusModeEnabled'], (data) => {
    const focusModeEnabled = data.focusModeEnabled || false; // Default to disabled

    // Process the message differently depending on whether focus mode is enabled
    if (request.action === 'enableFocus') {
      enableFocusMode();
    } else if (request.action === 'disableFocus') {
      disableFocusMode();
    }
  });
});

// Disables focus mode by removing blocking rules
function disableFocusMode() {
  // Remove the declarativeNetRequest rules
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1] // Assuming your rules use ID 1
  });
}

// Enables focus mode by setting up blocking rules based on the stored list of blocked websites
function enableFocusMode() {
  chrome.storage.sync.get(['blockedWebsites'], (data) => {
    const blockedWebsites = data.blockedWebsites || [];

    // Create declarativeNetRequest rules based on the blocked websites
    const rules = blockedWebsites.map(website => {
      return {
        id: 1, // Adjust id if you have other rules
        priority: 1, // Ensure this rule has priority
        action: { type: 'block' },
        condition: { 
          urlFilter: '*' + website + '*', // Block the specified hostname
          resourceTypes: ['xmlhttprequest', 'websocket', 'main_frame', 'sub_frame', 'script', 'image', 'stylesheet', 'object', 'font', 'media', 'other' ] // Adjust resourceTypes if needed
        }
      };
    });

    // Update the existing blocking rules with the new rules
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1], // Remove any previous rule with ID 1
      addRules: rules 
    });
  });
}