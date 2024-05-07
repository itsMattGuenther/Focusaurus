const websiteInput = document.getElementById('websiteInput');
const addWebsiteButton = document.getElementById('addWebsite');
const blockedList = document.getElementById('blockedList');
const enableFocusButton = document.getElementById('enableFocus');

// Focus state variable to determine if we're in focus mode or not
let focusModeEnabled = false;

// Load existing blocked websites from storage
chrome.storage.sync.get(['blockedWebsites'], (data) => {
    const blockedWebsites = data.blockedWebsites || []; // Default to empty array
    displayBlockedWebsites(blockedWebsites);
});

// Adding a website to block
addWebsiteButton.addEventListener('click', () => {
    const website = websiteInput.value.trim();
    if (website) {
        chrome.storage.sync.get(['blockedWebsites'], (data) => {
            let blockedWebsites = data.blockedWebsites || [];
            blockedWebsites.push(website);
            chrome.storage.sync.set({'blockedWebsites': blockedWebsites}, () => {
                displayBlockedWebsites(blockedWebsites);
                websiteInput.value = ''; 
            });
        });
    }
});

// Enabling Focus Mode
enableFocusButton.addEventListener('click', () => {
    focusModeEnabled = !focusModeEnabled;
    enableFocusButton.classList.toggle('power-on'); 
    const action = focusModeEnabled ? 'enableFocus' : 'disableFocus'; 
    chrome.runtime.sendMessage({ action });
    enableFocusButton.textContent = focusModeEnabled ? 'Disable' : 'Focus Mode';
    // Save the focusModeEnabled state to storage
    chrome.storage.sync.set({ 'focusModeEnabled': focusModeEnabled });
});

// Maintain focus mode state
chrome.storage.sync.get(['focusModeEnabled'], (data) => {
    focusModeEnabled = data.focusModeEnabled || false;
    enableFocusButton.textContent = focusModeEnabled ? 'Disable' : 'Focus Mode';
}); 

// Dynamically updates the visual list of blocked websites within the popup.
function displayBlockedWebsites(websites) {
    blockedList.innerHTML = ''; // Clear existing list
    const ul = document.createElement('ul');
    websites.forEach(website => {
        const li = document.createElement('li');
        li.textContent = website;
        const removeButton = document.createElement('button');
        removeButton.textContent = 'Remove';
        removeButton.classList.add('remove-button');

        removeButton.addEventListener('click', () => {
            removeWebsite(website, li);
        });

        li.appendChild(removeButton);
        ul.appendChild(li);
    });
    blockedList.appendChild(ul);
}

// This function handles the removal of a website from both the Chrome storage and the ui
function removeWebsite(website, listItem) {
    chrome.storage.sync.get(['blockedWebsites'], (data) => {
        let blockedWebsites = data.blockedWebsites || [];
        blockedWebsites = blockedWebsites.filter(item => item !== website);
        chrome.storage.sync.set({'blockedWebsites': blockedWebsites}, () => {
            listItem.remove(); // Remove the list item from the display
        });
    });
}