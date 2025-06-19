// Content script that runs on GitHub PR creation pages
(function() {
  'use strict';

  // Function to match patterns with wildcard support
  function matchesPattern(pattern, value) {
    if (!pattern || !value) return false;
    
    // Convert pattern to lowercase for case-insensitive matching
    const lowerPattern = pattern.toLowerCase();
    const lowerValue = value.toLowerCase();
    
    // If no wildcard, do exact match
    if (!lowerPattern.includes('*')) {
      return lowerPattern === lowerValue;
    }
    
    // Convert wildcard pattern to regex
    // Escape special regex characters except *
    const escapedPattern = lowerPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Replace * with regex pattern to match any characters
    const regexPattern = escapedPattern.replace(/\*/g, '.*');
    // Create regex with start and end anchors
    const regex = new RegExp(`^${regexPattern}$`);
    
    return regex.test(lowerValue);
  }

  // Function to replace placeholders in title template
  function replacePlaceholders(template, values) {
    if (!template) return template;
    
    let result = template;
    
    // Replace each placeholder with its corresponding value
    result = result.replace(/\{repo\}/g, values.repo || '');
    result = result.replace(/\{from_branch\}/g, values.from_branch || '');
    result = result.replace(/\{to_branch\}/g, values.to_branch || '');
    
    return result;
  }

  // Function to extract repository info from the current URL
  function getRepoInfo() {
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length >= 3) {
      return `${pathParts[1]}/${pathParts[2]}`;
    }
    return null;
  }

  // Function to extract branch info from the page
  function getBranchInfo() {
    // Try different selectors that GitHub might use for branch names
    const branchSelectors = [
      '.branch-name',
      '.commit-ref',
      '[data-hotkey="b"] .css-truncate-target',
      '.js-compare-tab .branch-name',
      '.range-editor .branch-name'
    ];

    let fromBranch = null;
    let toBranch = null;

    // Look for branch information in the compare URL
    const urlMatch = window.location.pathname.match(/\/compare\/([^.]+)\.\.\.([^?#]+)/);
    if (urlMatch) {
      toBranch = urlMatch[1];
      fromBranch = urlMatch[2];
    }

    // If not found in URL, try to find in the DOM
    if (!fromBranch || !toBranch) {
      const branchElements = document.querySelectorAll('.branch-name, .commit-ref');
      if (branchElements.length >= 2) {
        toBranch = branchElements[0].textContent.trim();
        fromBranch = branchElements[1].textContent.trim();
      }
    }

    // Also try looking for hidden form inputs that might contain branch names
    if (!fromBranch || !toBranch) {
      const baseRefInput = document.querySelector('input[name="pull_request[base_ref]"]');
      const headRefInput = document.querySelector('input[name="pull_request[head_ref]"]');
      
      if (baseRefInput && headRefInput) {
        toBranch = baseRefInput.value;
        fromBranch = headRefInput.value;
      }
    }

    return { fromBranch, toBranch };
  }

  // Function to find the title input field
  function getTitleInput() {
    const selectors = [
      'input[name="pull_request[title]"]',
      '#pull_request_title',
      'input[placeholder*="title"]',
      'input[aria-label*="title"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  // Function to check if current page is a PR creation page
  function isPRCreationPage() {
    return window.location.pathname.includes('/compare/') || 
           window.location.pathname.includes('/pull/new') ||
           document.querySelector('input[name="pull_request[title]"]') !== null;
  }

  // Function to apply matching rule
  function applyMatchingRule() {
    if (!isPRCreationPage()) {
      return;
    }

    const titleInput = getTitleInput();
    if (!titleInput) {
      console.log('PR Title Auto-filler: Title input not found');
      return;
    }

    // Check if we should replace existing title
    chrome.storage.sync.get(['alwaysReplace'], function(result) {
      // Default to true (always replace)
      const alwaysReplace = result.alwaysReplace !== undefined ? result.alwaysReplace : true;
      
      if (!alwaysReplace && titleInput.value.trim() !== '') {
        console.log('PR Title Auto-filler: Title already exists and alwaysReplace is disabled, not overwriting');
        return;
      }
      
      // Continue with the matching logic
      proceedWithMatching();
    });
  }

  function proceedWithMatching() {
    const titleInput = getTitleInput();
    if (!titleInput) {
      return;
    }

    const repo = getRepoInfo();
    const { fromBranch, toBranch } = getBranchInfo();

    if (!repo || !fromBranch || !toBranch) {
      console.log('PR Title Auto-filler: Could not extract repo/branch info', { repo, fromBranch, toBranch });
      return;
    }

    console.log('PR Title Auto-filler: Detected', { repo, fromBranch, toBranch });

    // Get rules from storage and find a match
    chrome.storage.sync.get(['prTitleRules'], function(result) {
      const rules = result.prTitleRules || [];
      
      const matchingRule = rules.find(rule => {
        return matchesPattern(rule.repo, repo) &&
               matchesPattern(rule.fromBranch, fromBranch) &&
               matchesPattern(rule.toBranch, toBranch);
      });

      if (matchingRule) {
        console.log('PR Title Auto-filler: Found matching rule', matchingRule);
        
        // Replace placeholders in the title template
        const finalTitle = replacePlaceholders(matchingRule.titleTemplate, {
          repo: repo,
          from_branch: fromBranch,
          to_branch: toBranch
        });
        
        titleInput.value = finalTitle;
        
        // Trigger input events to ensure GitHub recognizes the change
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Show a subtle notification
        showNotification(`Auto-filled title: "${finalTitle}"`);
      } else {
        console.log('PR Title Auto-filler: No matching rule found');
      }
    });
  }

  // Function to show a temporary notification
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #1f883d;
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      max-width: 300px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // Function to observe DOM changes and retry if elements aren't ready
  function waitForElements() {
    let attempts = 0;
    const maxAttempts = 20; // Increased from 10
    
    function tryApplyRule() {
      attempts++;
      const titleInput = getTitleInput();
      
      if (titleInput) {
        applyMatchingRule();
      } else if (attempts < maxAttempts) {
        setTimeout(tryApplyRule, 300); // Reduced from 500ms
      }
    }
    
    tryApplyRule();
  }

  // Enhanced navigation detection
  let lastUrl = location.href;
  let pageLoadTimeout;

  function handleNavigation() {
    console.log('PR Title Auto-filler: Navigation detected to', location.href);
    
    // Clear any existing timeout
    if (pageLoadTimeout) {
      clearTimeout(pageLoadTimeout);
    }
    
    // Set new timeout to wait for page content to load
    pageLoadTimeout = setTimeout(() => {
      if (isPRCreationPage()) {
        console.log('PR Title Auto-filler: PR creation page detected, applying rules');
        waitForElements();
      }
    }, 500); // Initial delay for page to start loading
  }

  // Multiple navigation detection methods
  
  // 1. Listen for History API changes (pushState/popState)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function() {
    originalPushState.apply(history, arguments);
    setTimeout(handleNavigation, 0);
  };
  
  history.replaceState = function() {
    originalReplaceState.apply(history, arguments);
    setTimeout(handleNavigation, 0);
  };
  
  window.addEventListener('popstate', handleNavigation);

  // 2. Listen for GitHub's specific navigation events
  document.addEventListener('pjax:success', handleNavigation);
  document.addEventListener('turbo:load', handleNavigation);
  document.addEventListener('turbo:render', handleNavigation);

  // 3. MutationObserver for URL changes and content updates
  const observer = new MutationObserver(function(mutations) {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      handleNavigation();
      return;
    }
    
    // Also check if PR form elements are added to the page
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if a PR title input was added
            if (node.querySelector && node.querySelector('input[name="pull_request[title]"]')) {
              console.log('PR Title Auto-filler: PR form detected in DOM mutation');
              setTimeout(waitForElements, 100);
              return;
            }
          }
        }
      }
    }
  });
  
  observer.observe(document, { 
    subtree: true, 
    childList: true,
    attributes: true,
    attributeFilter: ['href', 'src'] 
  });

  // 4. Periodically check if we're on a PR page (fallback)
  setInterval(() => {
    if (isPRCreationPage() && getTitleInput() && !getTitleInput().value.trim()) {
      // Only apply if title is empty to avoid overwriting user input
      waitForElements();
    }
  }, 2000);

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleNavigation);
  } else {
    handleNavigation();
  }

})(); 