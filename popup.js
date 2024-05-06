console.log("popup.js is loaded");
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOMContentLoaded");
    const form = document.getElementById('blockForm');
    console.log('Form: ', form);
    const message = document.getElementById('message');

    form.addEventListener('submit', function(event) {
        event.preventDefault(); // Prevent the default form submission

        // Get values from the form
        const domains = form.elements['domain'].value.trim().split(',');
        const blockTimeValue = form.elements['blockTime'].value.trim();
        const disableRule = form.elements['disableRule'].checked;

        // Basic validation
        if (domains.some(domain => domain === '') || blockTimeValue === '') {
            message.textContent = 'Please enter both domains and block time.';
            return;
        }

        // Parse block time
        const [hours, minutes] = blockTimeValue.split(':');

        // Create block time Date object
        const currentTime = new Date();
        const blockTimeDate = new Date(
            currentTime.getFullYear(),
            currentTime.getMonth(),
            currentTime.getDate(),
            hours,
            minutes
        );

        // Store the blocked domains, block time, and disable status in storage
        domains.forEach(domain => {
            const rule = { blockTime: blockTimeValue, disableRule }; 
            chrome.storage.local.set({ [domain.trim()]: rule }, function() {
                message.textContent = 'Domains blocked until ' + blockTimeValue + '.';
            });
        });

        // ... inside your event listener ...

  console.log('Form submitted!'); 
  console.log('Domains:', domains);
  console.log('Block Time Value:', blockTimeValue);
  console.log('Hours:', hours, 'Minutes:', minutes);

 // ... rest of your code ...


    });
});

// Function to validate domain format (You can make this more robust if needed)
function isValidDomain(domain) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(domain);
}

