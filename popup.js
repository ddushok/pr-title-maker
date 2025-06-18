document.addEventListener('DOMContentLoaded', function() {
  const repoInput = document.getElementById('repo');
  const fromBranchInput = document.getElementById('fromBranch');
  const toBranchInput = document.getElementById('toBranch');
  const titleTemplateInput = document.getElementById('titleTemplate');
  const addRuleButton = document.getElementById('addRule');
  const clearAllButton = document.getElementById('clearAll');
  const rulesList = document.getElementById('rulesList');
  const alwaysReplaceCheckbox = document.getElementById('alwaysReplace');
  
  // Track if we're editing a rule
  let editingRuleId = null;

  // Load and display existing rules
  loadRules();
  
  // Load settings
  loadSettings();

  // Add input handler for repository field to auto-convert GitHub URLs
  repoInput.addEventListener('blur', function() {
    const value = this.value.trim();
    const convertedRepo = convertGitHubUrlToRepo(value);
    if (convertedRepo !== value) {
      this.value = convertedRepo;
    }
  });

  addRuleButton.addEventListener('click', function() {
    const repo = repoInput.value.trim();
    const fromBranch = fromBranchInput.value.trim();
    const toBranch = toBranchInput.value.trim();
    const titleTemplate = titleTemplateInput.value.trim();

    if (!repo || !fromBranch || !toBranch || !titleTemplate) {
      alert('Please fill in all fields');
      return;
    }

    if (editingRuleId) {
      // Update existing rule
      const rule = {
        id: editingRuleId,
        repo: repo,
        fromBranch: fromBranch,
        toBranch: toBranch,
        titleTemplate: titleTemplate
      };
      
      updateRule(rule, function() {
        clearForm();
        exitEditMode();
        loadRules();
      });
    } else {
      // Add new rule
      const rule = {
        id: Date.now().toString(),
        repo: repo,
        fromBranch: fromBranch,
        toBranch: toBranch,
        titleTemplate: titleTemplate
      };

      addRule(rule, function() {
        clearForm();
        loadRules();
      });
    }
  });

  clearAllButton.addEventListener('click', function() {
    if (confirm('Are you sure you want to delete all rules?')) {
      chrome.storage.sync.clear(function() {
        loadRules();
        loadSettings(); // Reload settings after clearing storage
      });
    }
  });

  alwaysReplaceCheckbox.addEventListener('change', function() {
    saveSettings();
  });

  function clearForm() {
    repoInput.value = '';
    fromBranchInput.value = '';
    toBranchInput.value = '';
    titleTemplateInput.value = '';
  }

  function convertGitHubUrlToRepo(input) {
    if (!input) return input;
    
    // Regular expression to match various GitHub URL formats
    const githubUrlPatterns = [
      // https://github.com/owner/repo
      /^https?:\/\/github\.com\/([^\/]+)\/([^\/\?#]+)/,
      // git@github.com:owner/repo.git
      /^git@github\.com:([^\/]+)\/([^\/\?#\.]+)/,
      // github.com/owner/repo
      /^github\.com\/([^\/]+)\/([^\/\?#]+)/
    ];
    
    for (const pattern of githubUrlPatterns) {
      const match = input.match(pattern);
      if (match) {
        const owner = match[1];
        const repo = match[2];
        // Remove .git suffix if present
        const cleanRepo = repo.replace(/\.git$/, '');
        return `${owner}/${cleanRepo}`;
      }
    }
    
    // If no URL pattern matches, return the input as-is
    return input;
  }

  function enterEditMode() {
    addRuleButton.textContent = 'Update Rule';
    addRuleButton.style.backgroundColor = '#0969da';
    
    // Add cancel button if it doesn't exist
    if (!document.getElementById('cancelEdit')) {
      const cancelButton = document.createElement('button');
      cancelButton.id = 'cancelEdit';
      cancelButton.textContent = 'Cancel';
      cancelButton.className = 'cancel-button';
      cancelButton.style.marginTop = '8px';
      cancelButton.addEventListener('click', function() {
        clearForm();
        exitEditMode();
      });
      addRuleButton.parentNode.appendChild(cancelButton);
    }
  }

  function exitEditMode() {
    editingRuleId = null;
    addRuleButton.textContent = 'Add Rule';
    addRuleButton.style.backgroundColor = '#1f883d';
    
    // Remove cancel button
    const cancelButton = document.getElementById('cancelEdit');
    if (cancelButton) {
      cancelButton.remove();
    }
  }

  function addRule(rule, callback) {
    chrome.storage.sync.get(['prTitleRules'], function(result) {
      const rules = result.prTitleRules || [];
      rules.push(rule);
      chrome.storage.sync.set({ prTitleRules: rules }, function() {
        if (callback) {
          callback();
        }
      });
    });
  }

  function updateRule(updatedRule, callback) {
    chrome.storage.sync.get(['prTitleRules'], function(result) {
      const rules = result.prTitleRules || [];
      const ruleIndex = rules.findIndex(rule => rule.id === updatedRule.id);
      
      if (ruleIndex !== -1) {
        rules[ruleIndex] = updatedRule;
        chrome.storage.sync.set({ prTitleRules: rules }, function() {
          if (callback) {
            callback();
          }
        });
      }
    });
  }

  function moveRuleUp(ruleId) {
    chrome.storage.sync.get(['prTitleRules'], function(result) {
      const rules = result.prTitleRules || [];
      const ruleIndex = rules.findIndex(rule => rule.id === ruleId);
      
      if (ruleIndex > 0) {
        // Swap with the rule above
        [rules[ruleIndex - 1], rules[ruleIndex]] = [rules[ruleIndex], rules[ruleIndex - 1]];
        
        chrome.storage.sync.set({ prTitleRules: rules }, function() {
          loadRules();
        });
      }
    });
  }

  function moveRuleDown(ruleId) {
    chrome.storage.sync.get(['prTitleRules'], function(result) {
      const rules = result.prTitleRules || [];
      const ruleIndex = rules.findIndex(rule => rule.id === ruleId);
      
      if (ruleIndex >= 0 && ruleIndex < rules.length - 1) {
        // Swap with the rule below
        [rules[ruleIndex], rules[ruleIndex + 1]] = [rules[ruleIndex + 1], rules[ruleIndex]];
        
        chrome.storage.sync.set({ prTitleRules: rules }, function() {
          loadRules();
        });
      }
    });
  }

  function editRule(ruleId, rules) {
    const rule = rules.find(r => r.id === ruleId);
    if (rule) {
      // Enter edit mode
      editingRuleId = ruleId;
      
      // Populate form with rule data
      repoInput.value = rule.repo;
      fromBranchInput.value = rule.fromBranch;
      toBranchInput.value = rule.toBranch;
      titleTemplateInput.value = rule.titleTemplate;
      
      // Update UI to show edit mode
      enterEditMode();
      
      // Scroll to top of popup
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      
      // Focus on the first input for user convenience
      repoInput.focus();
    }
  }

  function copyRule(ruleId, rules) {
    const rule = rules.find(r => r.id === ruleId);
    if (rule) {
      // Populate form with rule data
      repoInput.value = rule.repo;
      fromBranchInput.value = rule.fromBranch;
      toBranchInput.value = rule.toBranch;
      titleTemplateInput.value = rule.titleTemplate;
      
      // Scroll to top of popup
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      
      // Focus on the first input for user convenience
      repoInput.focus();
    }
  }

  function deleteRule(ruleId) {
    chrome.storage.sync.get(['prTitleRules'], function(result) {
      const rules = result.prTitleRules || [];
      const filteredRules = rules.filter(rule => rule.id !== ruleId);
      chrome.storage.sync.set({ prTitleRules: filteredRules }, function() {
        loadRules();
      });
    });
  }

  function loadRules() {
    chrome.storage.sync.get(['prTitleRules'], function(result) {
      const rules = result.prTitleRules || [];
      displayRules(rules);
    });
  }

  function loadSettings() {
    chrome.storage.sync.get(['alwaysReplace'], function(result) {
      // Default to true (always replace)
      const alwaysReplace = result.alwaysReplace !== undefined ? result.alwaysReplace : true;
      alwaysReplaceCheckbox.checked = alwaysReplace;
    });
  }

  function saveSettings() {
    const alwaysReplace = alwaysReplaceCheckbox.checked;
    chrome.storage.sync.set({ alwaysReplace: alwaysReplace });
  }

  function displayRules(rules) {
    rulesList.innerHTML = '';
    
    if (rules.length === 0) {
      rulesList.innerHTML = '<div class="no-rules">No rules configured yet</div>';
      return;
    }

    rules.forEach(function(rule, index) {
      const ruleDiv = document.createElement('div');
      ruleDiv.className = 'rule-item';
      
      ruleDiv.innerHTML = `
        <div class="rule-header">${rule.repo}</div>
        <div class="rule-details">${rule.fromBranch} → ${rule.toBranch}</div>
        <div class="rule-title">${rule.titleTemplate}</div>
        <div class="rule-actions">
          <div class="sort-buttons">
            <button class="move-up" data-rule-id="${rule.id}" title="Move Up" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="move-down" data-rule-id="${rule.id}" title="Move Down" ${index === rules.length - 1 ? 'disabled' : ''}>↓</button>
          </div>
          <div class="action-buttons">
            <button class="edit-rule" data-rule-id="${rule.id}">Edit</button>
            <button class="copy-rule" data-rule-id="${rule.id}">Copy</button>
            <button class="delete-rule" data-rule-id="${rule.id}">Delete</button>
          </div>
        </div>
        <div style="clear: both;"></div>
      `;
      
      rulesList.appendChild(ruleDiv);
    });

    // Add move up event listeners
    document.querySelectorAll('.move-up').forEach(function(button) {
      button.addEventListener('click', function() {
        const ruleId = this.getAttribute('data-rule-id');
        moveRuleUp(ruleId);
      });
    });

    // Add move down event listeners
    document.querySelectorAll('.move-down').forEach(function(button) {
      button.addEventListener('click', function() {
        const ruleId = this.getAttribute('data-rule-id');
        moveRuleDown(ruleId);
      });
    });

    // Add edit event listeners
    document.querySelectorAll('.edit-rule').forEach(function(button) {
      button.addEventListener('click', function() {
        const ruleId = this.getAttribute('data-rule-id');
        editRule(ruleId, rules);
      });
    });

    // Add copy event listeners
    document.querySelectorAll('.copy-rule').forEach(function(button) {
      button.addEventListener('click', function() {
        const ruleId = this.getAttribute('data-rule-id');
        copyRule(ruleId, rules);
      });
    });

    // Add delete event listeners
    document.querySelectorAll('.delete-rule').forEach(function(button) {
      button.addEventListener('click', function() {
        const ruleId = this.getAttribute('data-rule-id');
        if (confirm('Are you sure you want to delete this rule?')) {
          deleteRule(ruleId);
        }
      });
    });
  }
}); 