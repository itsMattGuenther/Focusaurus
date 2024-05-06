chrome.declarativeNetRequest.getDynamicRules(function (rules) {
    // Remove any existing FocusBlocker rules
    const FocusaurusBlockerRuleIds = rules.map(rule => {
      if (rule.condition.urlFilter.includes('Focusaurus')) return rule.id;
    }).filter(Boolean);
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: FocusaurusBlockerRuleIds
    });
  });
  
  chrome.storage.onChanged.addListener((changes, namespace) => {
    for (let [domain, { blockTime, disableRule }] of Object.entries(changes)) {
      console.log('Domain changed:', domain);
      console.log('Block Time:', blockTime);
  
      if (disableRule) continue; // Rule is disabled
  
      const currentTime = new Date();
      const blockTimeDate = new Date(currentTime.toDateString() + ' ' + blockTime);
  
      if (currentTime < blockTimeDate) {
        chrome.declarativeNetRequest.updateDynamicRules({
          addRules: [{
            id: Math.random(), // Assign a random ID to the rule
            priority: 1,
            condition: {
              urlFilter: '*' + domain + '/*', 
              domains: [domain], 
              resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'object', 'xmlhttprequest', 'other'] 
            },
            action: {
              type: 'block'
            }
          }],
          removeRuleIds: [] 
        });
      }
    }
  });
  
