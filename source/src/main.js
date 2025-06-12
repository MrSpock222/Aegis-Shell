// ═══════════════════════════════════════════════════════════════════════════════
// AEGIS SHELL - Main Browser Engine
// ═══════════════════════════════════════════════════════════════════════════════

// Core Tauri imports
const { invoke } = window.__TAURI__.core;
const { WebviewWindow } = window.__TAURI__.webviewWindow;

// Try to get the current window - handle different Tauri versions
let getCurrentWindow;
try {
  getCurrentWindow = window.__TAURI__.webviewWindow.getCurrentWebviewWindow || 
                   window.__TAURI__.webviewWindow.getCurrent ||
                   (() => null);
} catch (error) {
  getCurrentWindow = () => null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREENSHOT PROTECTION API
// ─────────────────────────────────────────────────────────────────────────────

// Enable stealth mode for current window
async function enableScreenshotProtection() {
  try {
    const currentWindow = getCurrentWindow();
    const result = await invoke('enable_screenshot_protection', { 
      window: currentWindow ? currentWindow : 'main'
    });
    console.log('Screenshot protection enabled:', result);
    addSystemLog('✅ Screenshot protection enabled for main window', 'success');
    return true;
  } catch (error) {
    console.error('Failed to enable screenshot protection:', error);
    addSystemLog(`❌ Failed to enable screenshot protection: ${error.message}`, 'error');
    return false;
  }
}

// Disable stealth mode 
async function disableScreenshotProtection() {
  try {
    const currentWindow = getCurrentWindow();
    const result = await invoke('disable_screenshot_protection', { 
      window: currentWindow ? currentWindow : 'main'
    });
    console.log('Screenshot protection disabled:', result);
    addSystemLog('🔓 Screenshot protection disabled for main window', 'warning');
    return true;
  } catch (error) {
    console.error('Failed to disable screenshot protection:', error);
    addSystemLog(`❌ Failed to disable screenshot protection: ${error.message}`, 'error');
    return false;
  }
}

// Check if window is currently protected
async function checkScreenshotProtectionStatus() {
  try {
    const currentWindow = getCurrentWindow();
    const result = await invoke('check_screenshot_protection_status', { 
      window: currentWindow ? currentWindow : 'main'
    });
    console.log('Screenshot protection status:', result);
    return result;
  } catch (error) {
    console.error('Failed to check screenshot protection status:', error);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM REFERENCES & STATE
// ─────────────────────────────────────────────────────────────────────────────

// Navigation elements
let homeUrlInput;
let homeGoBtn;
let homeScreen;
let quickLinks;
let systemLogsBtn;
let systemLogsPanel;
let closeLogsBtn;
let logsContent;
let protectionToggleBtn;

// Protection verification modal elements
let protectionModal;
let verificationInput;
let confirmProtectionBtn;
let cancelProtectionBtn;
let countdownTimer;
let countdownProgress;

// Auto-reactivation status elements
let autoReactivationStatus;
let reactivationTimer;

// Current app state
let isOnHomePage = true;
let systemLogs = [];
let isProtectionEnabled = true;
let activeWindows = []; // Track all active windows

// Protection verification state
let verificationCountdown = 10;
let countdownInterval = null;
let isVerificationInProgress = false;

// Auto-reactivation timer
let autoReactivationTimer = null;
let autoReactivationCountdown = 300; // 5 minutes in seconds

// Initialize with startup log
systemLogs.push({
  timestamp: new Date().toLocaleTimeString('de-DE', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  }),
  message: '⚡ System startup initiated',
  type: 'info'
});

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM LOGGING
// ─────────────────────────────────────────────────────────────────────────────

// Add log entry to system logs
function addSystemLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('de-DE', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  
  const logEntry = {
    timestamp,
    message,
    type
  };
  
  systemLogs.unshift(logEntry); // Add to beginning
  
  // Keep only last 100 logs
  if (systemLogs.length > 100) {
    systemLogs = systemLogs.slice(0, 100);
  }
  
  // Update UI if logs panel is visible
  if (logsContent && !systemLogsPanel.classList.contains('hidden')) {
    updateLogsDisplay();
  }
  
  console.log(`[${timestamp}] ${message}`);
}

// Update the logs display
function updateLogsDisplay() {
  if (!logsContent) return;
  
  logsContent.innerHTML = '';
  
  systemLogs.forEach(log => {
    const logElement = document.createElement('div');
    logElement.className = `log-entry ${log.type}`;
    logElement.innerHTML = `
      <span class="log-time">${log.timestamp}</span>
      <span class="log-message">${log.message}</span>
    `;
    logsContent.appendChild(logElement);
  });
  
  // Auto-scroll to top (newest entries)
  logsContent.scrollTop = 0;
}

// Show/hide system logs panel
function toggleSystemLogs() {
  if (systemLogsPanel.classList.contains('hidden')) {
    systemLogsPanel.classList.remove('hidden');
    updateLogsDisplay();
    addSystemLog('📋 System logs panel opened', 'info');
    logWindowStatus(); // Show current window status when logs are opened
  } else {
    systemLogsPanel.classList.add('hidden');
    addSystemLog('📋 System logs panel closed', 'info');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

// Show main landing page
function showHomePage() {
  homeScreen.style.display = "flex";
  isOnHomePage = true;
  homeUrlInput.value = "";
  addSystemLog('🏠 Returned to home screen', 'info');
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBSITE PROCESSING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

// Known iframe-blocking sites (reference only and not used in this code)
const IFRAME_BLOCKED_SITES = [
  'google.com',
  'facebook.com', 
  'twitter.com',
  'instagram.com',
  'linkedin.com',
  'amazon.com',
  'netflix.com',
  'youtube.com'
];

// Smart URL processor and launcher
//echte URLs direkt öffnen, Text als Google-Suche
function showWebsite(url) {
  const originalInput = url.trim();
  
  // Auto-format URLs and detect search queries
  if (!originalInput.startsWith('http://') && !originalInput.startsWith('https://')) {
    // Check if it looks like a valid domain
    const hasValidDomain = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}/.test(originalInput);
    
    if (hasValidDomain) {
      // Looks like domain, add https://
      url = 'https://' + originalInput;
      addSystemLog(`🔗 Auto-formatted URL: ${url}`, 'info');
    } else {
      // Not URL format, treat as Google search
      console.log(`"${originalInput}" is not a URL, creating Google search`);
      addSystemLog(`🔍 Creating Google search for: "${originalInput}"`, 'info');
      const searchQuery = encodeURIComponent(originalInput);
      url = `https://www.google.com/search?q=${searchQuery}`;
    }
  } else {
    url = originalInput;
    addSystemLog(`🌐 Direct URL navigation: ${url}`, 'info');
  }
    try {
    new URL(url); // Validate final URL
    
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    if (url.includes('google.com/search')) {
      console.log(`Opening Google search for "${originalInput}" in new Aegis window`);
      addSystemLog(`🔍 Opening Google search in protected window`, 'success');
    } else {
      console.log(`Opening ${hostname} in new Aegis window`);
      addSystemLog(`🌐 Opening ${hostname} in protected window`, 'success');
    }
    
    openInNewAegisWindow(url);
    
  } catch (error) {
    // Still invalid? Force Google search
    console.log(`URL validation failed, creating Google search for "${originalInput}"`);
    addSystemLog(`❌ URL validation failed, fallback to Google search`, 'warning');
    const searchQuery = encodeURIComponent(originalInput);
    const googleSearchUrl = `https://www.google.com/search?q=${searchQuery}`;
    openInNewAegisWindow(googleSearchUrl);
  }
}

// Handle URL input submission
function handleHomeUrlNavigation() {
  const url = homeUrlInput.value.trim();
  console.log(`🚀 Navigation requested: "${url}"`);
  addSystemLog(`🚀 Navigation requested: "${url}"`, 'info');
  if (url) {
    showWebsite(url);
  } else {
    console.log("❌ No URL provided");
    addSystemLog('❌ No URL provided', 'warning');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS SETUP
// ─────────────────────────────────────────────────────────────────────────────

// Wire up all interactive elements
function setupEventListeners() {
  console.log("🔧 Setting up event listeners...");
  addSystemLog('🔧 Setting up event listeners...', 'info');
  
  // URL bar interactions
  homeGoBtn.addEventListener("click", () => {
    console.log("🖱️ Go button clicked");
    handleHomeUrlNavigation();
  });
  
  homeUrlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      console.log("⌨️ Enter key pressed");
      handleHomeUrlNavigation();
    }
  });
  // Protection toggle button
  console.log("🛡️ Setting up protection toggle button");
  addSystemLog('🛡️ Setting up protection toggle button', 'info');
  protectionToggleBtn.addEventListener("click", () => {
    console.log("🔄 Protection toggle button clicked");
    addSystemLog('🔄 Protection toggle button clicked', 'info');
    
    if (isProtectionEnabled) {
      // Show verification modal instead of directly toggling
      showProtectionVerificationModal();
    } else {
      // Enable protection directly (no verification needed for enabling)
      toggleProtection();
    }
  });

  // Protection verification modal event listeners
  setupProtectionVerificationListeners();

  // System logs button
  console.log("📋 Setting up system logs button");
  addSystemLog('📋 Setting up system logs button', 'info');
  systemLogsBtn.addEventListener("click", () => {
    console.log("📋 System logs button clicked");
    toggleSystemLogs();
  });

  // Close logs button
  closeLogsBtn.addEventListener("click", () => {
    console.log("❌ Close logs button clicked");
    toggleSystemLogs();
  });  // Quick link shortcuts
  console.log(`🔗 Setting up ${quickLinks.length} quick links`);
  addSystemLog(`🔗 Setting up ${quickLinks.length} quick links`, 'info');
  quickLinks.forEach((link, index) => {
    link.addEventListener("click", (e) => {
      const url = e.currentTarget.getAttribute("data-url");
      console.log(`🔗 Quick link ${index} clicked: ${url}`);
      addSystemLog(`🔗 Quick link clicked: ${url}`, 'info');
      if (url) {
        showWebsite(url);
      }
    });
  });
  
  console.log("✅ All event listeners setup complete");
  addSystemLog('✅ All event listeners setup complete', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-WINDOW BROWSER ENGINE  
// ─────────────────────────────────────────────────────────────────────────────

// Launch new protected browser window
async function openInNewAegisWindow(url) {
  try {
    const windowLabel = `aegis-${Date.now()}`;
    addSystemLog(`🆔 New window detected: ${windowLabel}`, 'info');
      const webview = new WebviewWindow(windowLabel, {
      url: `website.html?url=${encodeURIComponent(url)}`,
      title: `Aegis Shell - ${new URL(url).hostname}`,
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      center: true,
      resizable: true,
      visible: !isProtectionEnabled, // 🛡️ Start visible only if protection is disabled
      skipTaskbar: false
    });
    
    // Add to active windows list
    const windowInfo = {
      label: windowLabel,
      window: webview,
      url: url,
      created: new Date()
    };
    activeWindows.push(windowInfo);
      // Backend handles protection & visibility automatically
    webview.once('tauri://created', async () => {
      console.log(`🆕 Window created: ${windowLabel} for ${url}`);
      
      // Apply current global protection status to new window
      if (isProtectionEnabled) {
        // Window should already be protected by backend and hidden, just show it
        addSystemLog(`🛡️ Backend protection enabled for: ${windowLabel} (attempt 1)`, 'success');
        addSystemLog(`✅ BACKEND: Window shown safely with protection: ${windowLabel}`, 'success');
        
        // Show the window safely after protection is confirmed
        setTimeout(async () => {
          try {
            await webview.show();
            addSystemLog(`👁️ Protected window now visible: ${windowLabel}`, 'success');
          } catch (error) {
            console.error(`Failed to show protected window: ${error}`);
          }
        }, 500);
      } else {
        // Protection is globally disabled, disable it for this window too
        try {
          await applyProtectionToWindow(windowLabel, false);
          addSystemLog(`🔓 Protection disabled for new window: ${windowLabel}`, 'warning');
          
          // Since window was created visible (visible: true), no need to show() it manually
          addSystemLog(`👁️ Unprotected window is already visible: ${windowLabel}`, 'warning');
        } catch (error) {
          addSystemLog(`❌ Failed to apply protection status to: ${windowLabel}`, 'error');
        }
      }
      
      console.log(`⏳ Window handling complete for: ${windowLabel}`);
    });

    // Handle window closure - remove from active windows list
    webview.once('tauri://destroyed', () => {
      activeWindows = activeWindows.filter(w => w.label !== windowLabel);
      addSystemLog(`🗑️ Window closed: ${windowLabel}`, 'info');
      console.log(`Window ${windowLabel} removed from active windows list`);
    });

    webview.once('tauri://error', (e) => {
      console.error('Error creating new Aegis window:', e);
      addSystemLog(`❌ Error creating window: ${e.payload}`, 'error');
      // Remove from active windows list on error
      activeWindows = activeWindows.filter(w => w.label !== windowLabel);
      alert('Fehler beim Erstellen eines neuen Fensters: ' + e.payload);
    });
    
  } catch (error) {
    console.error('Error creating new Aegis window:', error);
    addSystemLog(`❌ Failed to create new window: ${error.message}`, 'error');
    alert('Fehler beim Öffnen eines neuen Fensters: ' + error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APPLICATION INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

// Main app startup sequence
window.addEventListener("DOMContentLoaded", async () => {
  console.log("🔧 DOM Content Loaded - Initializing Aegis Shell...");
    // Grab DOM references
  homeUrlInput = document.querySelector("#home-url-input");
  homeGoBtn = document.querySelector("#home-go-btn");
  homeScreen = document.querySelector("#home-screen");
  quickLinks = document.querySelectorAll(".quick-link");
  systemLogsBtn = document.querySelector("#system-logs-btn");
  systemLogsPanel = document.querySelector("#system-logs-panel");
  closeLogsBtn = document.querySelector("#close-logs-btn");
  logsContent = document.querySelector("#logs-content");
  protectionToggleBtn = document.querySelector("#protection-toggle-btn");
  protectionToggleBtn = document.querySelector("#protection-toggle-btn");
    // Protection verification modal elements
  protectionModal = document.getElementById("protection-verification-modal");
  verificationInput = document.getElementById("verification-code");
  confirmProtectionBtn = document.getElementById("confirm-protection-btn");
  cancelProtectionBtn = document.getElementById("cancel-protection-btn");
  countdownTimer = document.getElementById("countdown-timer");
  countdownProgress = document.getElementById("countdown-progress");

  // Auto-reactivation status elements
  autoReactivationStatus = document.getElementById("auto-reactivation-status");
  reactivationTimer = document.getElementById("reactivation-timer");
  
  // Validate critical protection modal elements
  const missingElements = [];
  if (!protectionModal) missingElements.push('protection-verification-modal');
  if (!verificationInput) missingElements.push('verification-code');
  if (!confirmProtectionBtn) missingElements.push('confirm-protection-btn');
  if (!cancelProtectionBtn) missingElements.push('cancel-protection-btn');
  if (!countdownTimer) missingElements.push('countdown-timer');
  if (!countdownProgress) missingElements.push('countdown-progress');
  
  if (missingElements.length > 0) {
    console.warn('Missing protection modal elements:', missingElements);
    addSystemLog(`⚠️ Missing DOM elements: ${missingElements.join(', ')}`, 'warning');
  } else {
    addSystemLog('✅ All protection modal elements found', 'success');
  }
  
  // Initialize system logs
  addSystemLog('🚀 AEGIS SHELL INITIALIZING...', 'info');
  addSystemLog('🔧 DOM Content Loaded - Initializing Aegis Shell...', 'info');
  addSystemLog('🛡️ Security systems loading...', 'info');
  addSystemLog('🔐 AES-256 encryption ready', 'success');
  addSystemLog('👻 Stealth mode preparing...', 'info');
  addSystemLog(`📅 Session started: ${new Date().toLocaleDateString('de-DE')}`, 'info');
    // Debug: Verify all elements found
  console.log("Elements found:", {
    homeUrlInput: !!homeUrlInput,
    homeGoBtn: !!homeGoBtn,
    homeScreen: !!homeScreen,
    quickLinksCount: quickLinks.length,
    systemLogsBtn: !!systemLogsBtn,
    systemLogsPanel: !!systemLogsPanel,
    protectionToggleBtn: !!protectionToggleBtn
  });
  
  // Initialize protection button
  if (protectionToggleBtn) {
    updateProtectionButton();
  }
  
  // Abort if critical elements missing
  if (!homeUrlInput || !homeGoBtn || !homeScreen) {
    console.error("❌ Critical elements not found!");
    addSystemLog('❌ Critical elements not found!', 'error');
    return;
  }
  
  // Wire up interactions
  setupEventListeners();
  console.log("✅ Event listeners setup complete");
  
  // Display main interface
  showHomePage();
  console.log("✅ Home page displayed");
  // Activate stealth protection for main window
  try {
    await enableScreenshotProtection();
    console.log("🛡️ Main window protected - Aegis Shell initialized");
    
    // Update protection status
    isProtectionEnabled = true;
    updateProtectionButton();
    addSystemLog('🛡️ Initial protection status: ENABLED', 'success');
    
    // Sync global protection state with backend
    try {
      await invoke('set_global_protection_state', { enabled: true });
      addSystemLog('🔄 Backend global protection state synchronized: ENABLED', 'success');
    } catch (error) {
      addSystemLog(`❌ Failed to sync backend protection state: ${error}`, 'error');
    }
    
    // Update live status indicators
    updateStatusBar();
  } catch (error) {
    console.error("Failed to enable screenshot protection for main window:", error);
    isProtectionEnabled = false;
    updateProtectionButton();
    addSystemLog(`❌ Failed to enable screenshot protection: ${error.message}`, 'error');
    
    // Sync global protection state with backend (disabled)
    try {
      await invoke('set_global_protection_state', { enabled: false });
      addSystemLog('🔄 Backend global protection state synchronized: DISABLED', 'warning');
    } catch (error) {
      addSystemLog(`❌ Failed to sync backend protection state: ${error}`, 'error');
    }
  }
    console.log("🚀 AEGIS SHELL INITIALIZED - Secure invisible browsing ready");
  addSystemLog('🚀 AEGIS SHELL INITIALIZED - Secure invisible browsing ready', 'success');
  addSystemLog('🛡️ Enhanced error handling and window management active', 'info');
  addSystemLog('🔧 Auto-recovery system enabled', 'info');
  
  console.log("✅ Aegis Shell initialization complete with enhanced error handling");
  
  // Periodic update of button tooltip with window count
  setInterval(() => {
    updateProtectionButton();
  }, 5000); // Update every 5 seconds
});

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER NAVIGATION HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

// Handle browser back/forward navigation
window.addEventListener("popstate", (e) => {
  if (e.state && e.state.page === "home") {
    showHomePage();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL API EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

// Export core functions for external use
window.aegisShell = {
  showHomePage,
  showWebsite,
  isOnHomePage: () => isOnHomePage
};

// ─────────────────────────────────────────────────────────────────────────────
// UI STATUS UPDATES
// ─────────────────────────────────────────────────────────────────────────────

// Animate status bar with live security indicators
function updateStatusBar() {
  // Dynamic security status updates
  const statusItems = document.querySelectorAll('.status-item span');
  if (statusItems.length > 0) {
    setTimeout(() => {
      statusItems[0].textContent = 'PROTECTED';
      statusItems[1].textContent = 'ENCRYPTION: ACTIVE';
      statusItems[2].textContent = 'STEALTH: ENGAGED';
    }, 1000);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTION TOGGLE FUNCTIONALITY
// ─────────────────────────────────────────────────────────────────────────────

// Apply protection to a specific window
async function applyProtectionToWindow(windowLabel, enable = true) {
  try {
    if (enable) {
      const result = await invoke('enable_screenshot_protection_by_label', { 
        label: windowLabel
      });
      console.log(`Protection enabled for ${windowLabel}:`, result);
    } else {
      const result = await invoke('disable_screenshot_protection_by_label', { 
        label: windowLabel
      });
      console.log(`Protection disabled for ${windowLabel}:`, result);
    }
    return true;
  } catch (error) {
    console.error(`Failed to ${enable ? 'enable' : 'disable'} protection for window ${windowLabel}:`, error);
    return false;
  }
}

// Toggle screenshot protection for all windows
async function toggleProtection() {
  try {
    if (isProtectionEnabled) {
      // Disable protection for all windows
      addSystemLog('🔄 Disabling protection for all windows...', 'info');
      addSystemLog('⚠️ CRITICAL: User bypassed security verification', 'error');
      
      // 1. Update global backend state FIRST
      try {
        await invoke('set_global_protection_state', { enabled: false });
        addSystemLog('🔄 Backend global protection state: DISABLED', 'info');
      } catch (error) {
        addSystemLog(`❌ Failed to update backend protection state: ${error}`, 'error');
      }
      
      // 2. Disable for main window
      const mainResult = await disableScreenshotProtection();        // 3. Disable for all active browser windows
      let windowCount = 0;
      
      // Clean up dead windows first
      cleanupDeadWindows();
      
      for (const windowInfo of activeWindows) {
        if (windowInfo.label) {
          try {
            const success = await applyProtectionToWindow(windowInfo.label, false);
            if (success) {
              windowCount++;
              addSystemLog(`🔓 Protection disabled for: ${windowInfo.label}`, 'warning');
            } else {
              addSystemLog(`⚠️ Could not disable protection for: ${windowInfo.label}`, 'warning');
            }
          } catch (error) {
            addSystemLog(`❌ Failed to disable protection for: ${windowInfo.label}`, 'error');
          }
        }
      }
        if (mainResult) {
        isProtectionEnabled = false;
        updateProtectionButton();
        
        // Broadcast state change to all windows
        await broadcastProtectionStateChange(false);
        
        addSystemLog(`🔓 Screenshot protection DISABLED for ${windowCount + 1} windows`, 'warning');
        addSystemLog('⚠️ Warning: All windows are now vulnerable to screenshots', 'warning');
        
        // Start auto-reactivation timer (5 minutes)
        startAutoReactivationTimer();
      }
    } else {
      // Enable protection for all windows
      addSystemLog('🔄 Enabling protection for all windows...', 'info');
      addSystemLog('✅ SECURITY: Protection re-enabled by user', 'success');
      
      // 1. Update global backend state FIRST
      try {
        await invoke('set_global_protection_state', { enabled: true });
        addSystemLog('🔄 Backend global protection state: ENABLED', 'info');
      } catch (error) {
        addSystemLog(`❌ Failed to update backend protection state: ${error}`, 'error');
      }
      
      // 2. Enable for main window
      const mainResult = await enableScreenshotProtection();        // 3. Enable for all active browser windows
      let windowCount = 0;
      
      // Clean up dead windows first
      cleanupDeadWindows();
      
      for (const windowInfo of activeWindows) {
        if (windowInfo.label) {
          try {
            const success = await applyProtectionToWindow(windowInfo.label, true);
            if (success) {
              windowCount++;
              addSystemLog(`🛡️ Protection enabled for: ${windowInfo.label}`, 'success');
            } else {
              addSystemLog(`⚠️ Could not enable protection for: ${windowInfo.label}`, 'warning');
            }
          } catch (error) {
            addSystemLog(`❌ Failed to enable protection for: ${windowInfo.label}`, 'error');
          }
        }
      }
        if (mainResult) {
        isProtectionEnabled = true;
        updateProtectionButton();
        
        // Broadcast state change to all windows
        await broadcastProtectionStateChange(true);
        
        addSystemLog(`🛡️ Screenshot protection ENABLED for ${windowCount + 1} windows`, 'success');
        addSystemLog('✅ All windows are now protected from screenshots', 'success');
        
        // Clear auto-reactivation timer
        clearAutoReactivationTimer();
      }
    }
  } catch (error) {
    addSystemLog(`❌ Failed to toggle protection: ${error.message}`, 'error');
  }
}

// Broadcast protection state change to all windows
async function broadcastProtectionStateChange(enabled) {
  try {
    // Emit event to all windows
    await invoke('emit_protection_state_event', { enabled });
    console.log(`📡 Protection state broadcasted: ${enabled}`);
    addSystemLog(`📡 Protection state broadcasted to all windows: ${enabled ? 'ENABLED' : 'DISABLED'}`, 'info');
  } catch (error) {
    console.error('Failed to broadcast protection state:', error);
    addSystemLog(`❌ Failed to broadcast protection state: ${error.message}`, 'error');
  }
}

// Update protection button appearance
function updateProtectionButton() {
  if (!protectionToggleBtn) return;
  
  if (isProtectionEnabled) {
    protectionToggleBtn.className = 'protection-enabled';
    protectionToggleBtn.textContent = '🛡️ PROTECTION ON';
    protectionToggleBtn.title = `Click to disable screenshot protection for all windows (${activeWindows.length + 1} total)`;
    
    // UI für aktiven Schutz
    document.body.classList.remove('protection-disabled');
    updateUIForProtectionState(true);
  } else {
    protectionToggleBtn.className = 'protection-disabled';
    protectionToggleBtn.textContent = '🔓 PROTECTION OFF';
    protectionToggleBtn.title = `Click to enable screenshot protection for all windows (${activeWindows.length + 1} total)`;
    
    // UI für deaktivierten Schutz
    document.body.classList.add('protection-disabled');
    updateUIForProtectionState(false);
  }
}

// Update UI basierend auf Protection State
function updateUIForProtectionState(isProtected) {
  const securityBadge = document.querySelector('.security-badge');
  const statusItems = document.querySelectorAll('.status-item span');
  
  if (isProtected) {
    // Geschützter Zustand
    if (securityBadge) {
      securityBadge.innerHTML = '🛡️ SECURE';
    }
    
    // Status-Updates für geschützten Zustand
    if (statusItems.length >= 3) {
      statusItems[0].textContent = 'PROTECTED';
      statusItems[1].textContent = 'ENCRYPTION: AES-256';
      statusItems[2].textContent = 'STEALTH: ACTIVE';
    }
    
    addSystemLog('✅ UI updated for PROTECTED state', 'success');
  } else {
    // Ungeschützter Zustand
    if (securityBadge) {
      securityBadge.innerHTML = '⚠️ UNPROTECTED';
    }
    
    // Status-Updates für ungeschützten Zustand
    if (statusItems.length >= 3) {
      statusItems[0].textContent = 'VULNERABLE';
      statusItems[1].textContent = 'ENCRYPTION: DISABLED';
      statusItems[2].textContent = 'STEALTH: INACTIVE';
    }
    
    addSystemLog('⚠️ UI updated for UNPROTECTED state', 'warning');
    addSystemLog('🚨 WARNING: Application is now visible to screenshot tools!', 'error');
  }
}

// Log current window status
function logWindowStatus() {
  addSystemLog(`📊 Active windows: ${activeWindows.length + 1} (main + ${activeWindows.length} browser)`, 'info');
  addSystemLog(`🛡️ Global protection status: ${isProtectionEnabled ? 'ENABLED' : 'DISABLED'}`, isProtectionEnabled ? 'success' : 'warning');
  
  // Debug: List all active window labels
  if (activeWindows.length > 0) {
    const windowLabels = activeWindows.map(w => w.label).join(', ');
    addSystemLog(`🪟 Window labels: ${windowLabels}`, 'info');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTION VERIFICATION MODAL
// ─────────────────────────────────────────────────────────────────────────────

// Show protection verification modal
function showProtectionVerificationModal() {
  if (isVerificationInProgress) return;
  
  // Check if modal is available
  if (!protectionModal || !verificationInput || !confirmProtectionBtn) {
    console.error('Protection verification modal elements not found');
    addSystemLog('❌ Protection verification modal not available', 'error');
    alert('Protection verification is not available. Please reload the application.');
    return;
  }
  
  isVerificationInProgress = true;
  
  // RESET ALL VERIFICATION STATE - This fixes the timer bug
  verificationCountdown = 10;
  
  // Reset modal state completely
  verificationInput.value = '';
  verificationInput.classList.remove('correct');
  confirmProtectionBtn.disabled = true;
  
  // Reset countdown display to initial state (safe method)
  safeResetCountdownTimer();
  
  // Show modal
  protectionModal.classList.remove('hidden');
  
  // Start fresh countdown
  startVerificationCountdown();
  
  // Focus input after a short delay
  setTimeout(() => {
    verificationInput.focus();
  }, 300);
  
  addSystemLog('🚨 Protection verification modal opened', 'warning');
}

// Hide protection verification modal
function hideProtectionVerificationModal() {
  protectionModal.classList.add('hidden');
  isVerificationInProgress = false;
  
  // Clear countdown
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
    // Reset ALL verification state completely
  verificationCountdown = 10;
  verificationInput.value = '';
  verificationInput.classList.remove('correct');
  confirmProtectionBtn.disabled = true;
  
  // Reset countdown display to initial state (safe method)
  safeResetCountdownTimer();
  
  addSystemLog('✅ Protection verification modal closed', 'info');
}

// Start verification countdown
function startVerificationCountdown() {
  updateCountdownDisplay();
  
  countdownInterval = setInterval(() => {
    verificationCountdown--;
    updateCountdownDisplay();
    
    if (verificationCountdown <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      
      // Enable input validation after countdown
      enableVerificationInput();
      addSystemLog('⏰ Verification countdown completed - input enabled', 'info');
    }
  }, 1000);
}

// Update countdown display
function updateCountdownDisplay() {
  if (countdownTimer) {
    countdownTimer.textContent = verificationCountdown;
  }
  
  if (countdownProgress) {
    const percentage = ((10 - verificationCountdown) / 10) * 100;
    countdownProgress.style.width = `${percentage}%`;
  }
  
  // Update button state based on countdown
  if (verificationCountdown <= 0 && verificationInput.value.toUpperCase() === 'DEACTIVATE') {
    confirmProtectionBtn.disabled = false;
  }
}

// Enable verification input validation
function enableVerificationInput() {
  // Update countdown text to English (safe method)
  safeUpdateCountdownText('Confirmation is <span style="color: var(--primary-color);">NOW AVAILABLE</span>');
  
  // Check current input value
  validateVerificationInput();
}

// Validate verification input
function validateVerificationInput() {
  const inputValue = verificationInput.value.toUpperCase();
  const isCorrect = inputValue === 'DEACTIVATE';
  
  if (isCorrect) {
    verificationInput.classList.add('correct');
    if (verificationCountdown <= 0) {
      confirmProtectionBtn.disabled = false;
    }
  } else {
    verificationInput.classList.remove('correct');
    confirmProtectionBtn.disabled = true;
  }
}

// Setup protection verification event listeners
function setupProtectionVerificationListeners() {
  if (!verificationInput || !confirmProtectionBtn || !cancelProtectionBtn || !protectionModal) {
    console.warn('Protection verification elements not found - listeners not setup');
    addSystemLog('⚠️ Protection verification elements missing - some features may not work', 'warning');
    return;
  }
  
  // Input validation
  verificationInput.addEventListener('input', validateVerificationInput);
  
  // Enter key handling
  verificationInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !confirmProtectionBtn.disabled) {
      confirmProtectionBtn.click();
    } else if (e.key === 'Escape') {
      cancelProtectionBtn.click();
    }
  });
    // Confirm button
  confirmProtectionBtn.addEventListener('click', () => {
    if (verificationInput.value.toUpperCase() === 'DEACTIVATE' && verificationCountdown <= 0) {
      addSystemLog('🔓 User confirmed protection deactivation', 'warning');
      addSystemLog('⚠️ SECURITY ALERT: Protection verification bypassed by user', 'error');
      hideProtectionVerificationModal();
      
      // Show final warning before proceeding
      setTimeout(() => {
        // Proceed with actual protection toggle
        toggleProtection();
      }, 500);
    }
  });
  
  // Cancel button
  cancelProtectionBtn.addEventListener('click', () => {
    addSystemLog('❌ User cancelled protection deactivation', 'info');
    hideProtectionVerificationModal();
  });
  
  // Close modal on background click
  protectionModal.addEventListener('click', (e) => {
    if (e.target === protectionModal) {
      addSystemLog('❌ Protection verification cancelled (background click)', 'info');
      hideProtectionVerificationModal();
    }
  });
  
  addSystemLog('🔧 Protection verification listeners setup complete', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR HANDLING ENHANCEMENTS
// ─────────────────────────────────────────────────────────────────────────────

// Global error handler
window.addEventListener('error', (event) => {
  const { message, source, lineno, colno, error } = event;
  const errorMsg = `❌ Uncaught Error: ${message} at ${source}:${lineno}:${colno}`;
  
  addSystemLog(errorMsg, 'error');
  console.error(errorMsg, error);
  
  // Alert user with a friendly message
  alert('Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
});

// Log unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const { reason } = event;
  const errorMsg = `❌ Unhandled Rejection: ${reason}`;
  
  addSystemLog(errorMsg, 'error');
  console.error(errorMsg);
});

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL ERROR RECOVERY SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

// Global error recovery function
function performErrorRecovery() {
  try {
    addSystemLog('🔧 Performing error recovery...', 'info');
    
    // 1. Clean up dead windows
    cleanupDeadWindows();
    
    // 2. Verify protection state consistency
    updateProtectionButton();
    
    // 3. Update UI state
    updateUIForProtectionState(isProtectionEnabled);
    
    addSystemLog('✅ Error recovery completed', 'success');
  } catch (error) {
    console.error('Error during recovery:', error);
    addSystemLog(`❌ Error recovery failed: ${error.message}`, 'error');
  }
}

// Periodic system health check
setInterval(() => {
  try {
    performErrorRecovery();
  } catch (error) {
    console.error('System health check failed:', error);
  }
}, 60000); // Every minute

// ─────────────────────────────────────────────────────────────────────────────
// PERIODIC TASKS
// ─────────────────────────────────────────────────────────────────────────────

// Periodic health check of active windows
setInterval(() => {
  try {
    // Clean up any dead windows first
    cleanupDeadWindows();
    
    // Log current status
    console.log(`Health check: ${activeWindows.length} active window(s)`);
    
    // Optional: Update protection status for all active windows
    if (activeWindows.length > 0) {
      addSystemLog(`💓 Health check: ${activeWindows.length} window(s) active`, 'info');
    }
  } catch (error) {
    console.error('Error during window health check:', error);
    addSystemLog(`❌ Window health check failed: ${error.message}`, 'error');
  }
}, 30000); // 30 seconds interval

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-REACTIVATION SECURITY TIMER
// ─────────────────────────────────────────────────────────────────────────────

// Start auto-reactivation timer (automatically re-enable protection after 5 minutes)
function startAutoReactivationTimer() {
  // Clear any existing timer
  clearAutoReactivationTimer();
  
  autoReactivationCountdown = 300; // 5 minutes
  addSystemLog(`⏱️ Auto-reactivation timer started: Protection will re-enable in ${Math.floor(autoReactivationCountdown / 60)} minutes`, 'warning');
  
  // Show auto-reactivation status in UI
  if (autoReactivationStatus) {
    autoReactivationStatus.classList.remove('hidden');
  }
  
  autoReactivationTimer = setInterval(async () => {
    autoReactivationCountdown--;
    
    // Update UI timer display
    updateAutoReactivationDisplay();
    
    // Log countdown at specific intervals
    if (autoReactivationCountdown === 240) { // 4 minutes remaining
      addSystemLog('⏱️ Auto-reactivation in 4 minutes', 'warning');
    } else if (autoReactivationCountdown === 180) { // 3 minutes remaining
      addSystemLog('⏱️ Auto-reactivation in 3 minutes', 'warning');
    } else if (autoReactivationCountdown === 120) { // 2 minutes remaining
      addSystemLog('⏱️ Auto-reactivation in 2 minutes', 'warning');
    } else if (autoReactivationCountdown === 60) { // 1 minute remaining
      addSystemLog('⏱️ FINAL WARNING: Auto-reactivation in 1 minute', 'error');
    } else if (autoReactivationCountdown === 30) { // 30 seconds remaining
      addSystemLog('🚨 CRITICAL: Auto-reactivation in 30 seconds', 'error');
    } else if (autoReactivationCountdown <= 10 && autoReactivationCountdown > 0) { // Final countdown
      addSystemLog(`🚨 AUTO-REACTIVATION IN ${autoReactivationCountdown} SECONDS`, 'error');
    }
    
    // Auto-reactivate when countdown reaches 0
    if (autoReactivationCountdown <= 0) {
      clearAutoReactivationTimer();
      
      if (!isProtectionEnabled) {
        addSystemLog('🤖 AUTO-REACTIVATION: Protection automatically re-enabled for security', 'success');
        await toggleProtectionDirectly(true); // Use direct toggle to bypass verification
      }
    }
  }, 1000);
}

// Clear auto-reactivation timer
function clearAutoReactivationTimer() {
  if (autoReactivationTimer) {
    clearInterval(autoReactivationTimer);
    autoReactivationTimer = null;
    addSystemLog('⏱️ Auto-reactivation timer cleared', 'info');
  }
  
  // Hide auto-reactivation status in UI
  if (autoReactivationStatus) {
    autoReactivationStatus.classList.add('hidden');
  }
}

// Update auto-reactivation display
function updateAutoReactivationDisplay() {
  if (reactivationTimer && autoReactivationCountdown > 0) {
    const minutes = Math.floor(autoReactivationCountdown / 60);
    const seconds = autoReactivationCountdown % 60;
    reactivationTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}

// Direct protection toggle (bypasses verification - used for auto-reactivation)
async function toggleProtectionDirectly(enable) {
  try {
    if (enable && !isProtectionEnabled) {
      // Enable protection for all windows (direct)
      addSystemLog('🔄 Auto-enabling protection for all windows...', 'info');
      
      // 1. Update global backend state FIRST
      try {
        await invoke('set_global_protection_state', { enabled: true });
        addSystemLog('🔄 Backend global protection state: ENABLED (AUTO)', 'info');
      } catch (error) {
        addSystemLog(`❌ Failed to update backend protection state: ${error}`, 'error');
      }
      
      // 2. Enable for main window
      const mainResult = await enableScreenshotProtection();
        // 3. Enable for all active browser windows
      let windowCount = 0;
      
      // Clean up dead windows first
      cleanupDeadWindows();
      
      for (const windowInfo of activeWindows) {
        if (windowInfo.label) {
          try {
            const success = await applyProtectionToWindow(windowInfo.label, true);
            if (success) {
              windowCount++;
              addSystemLog(`🛡️ Protection auto-enabled for: ${windowInfo.label}`, 'success');
            } else {
              addSystemLog(`⚠️ Could not auto-enable protection for: ${windowInfo.label}`, 'warning');
            }
          } catch (error) {
            addSystemLog(`❌ Failed to auto-enable protection for: ${windowInfo.label}`, 'error');
          }
        }
      }
      
      if (mainResult) {
        isProtectionEnabled = true;
        updateProtectionButton();
        
        // Broadcast state change to all windows
        await broadcastProtectionStateChange(true);
        
        addSystemLog(`🤖 Screenshot protection AUTO-ENABLED for ${windowCount + 1} windows`, 'success');
        addSystemLog('✅ All windows are now protected from screenshots (AUTO)', 'success');
      }
    }
  } catch (error) {
    addSystemLog(`❌ Failed to auto-toggle protection: ${error.message}`, 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED ERROR HANDLING & WINDOW MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

// Safe window operation wrapper
function safeWindowOperation(windowInfo, operation, operationName = 'operation') {
  try {
    if (!windowInfo || !windowInfo.window) {
      console.warn(`Cannot perform ${operationName}: window info is invalid`);
      return false;
    }
    
    // Check if window is still valid
    if (windowInfo.window.label) {
      return operation(windowInfo.window);
    } else {
      console.warn(`Window ${windowInfo.label} appears to be closed`);
      return false;
    }
  } catch (error) {
    console.error(`Error during ${operationName} for window ${windowInfo.label}:`, error);
    addSystemLog(`❌ ${operationName} failed for window ${windowInfo.label}: ${error.message}`, 'error');
    return false;
  }
}

// Clean up dead windows from active windows list
function cleanupDeadWindows() {
  const initialCount = activeWindows.length;
  
  activeWindows = activeWindows.filter(windowInfo => {
    try {
      // Test if window is still alive by accessing its label
      if (windowInfo.window && windowInfo.window.label) {
        return true; // Window is still alive
      }
      return false; // Window is dead
    } catch (error) {
      console.warn(`Removing dead window: ${windowInfo.label}`, error);
      addSystemLog(`🗑️ Removed dead window: ${windowInfo.label}`, 'info');
      return false;
    }
  });
  
  const removedCount = initialCount - activeWindows.length;
  if (removedCount > 0) {
    addSystemLog(`🧹 Cleaned up ${removedCount} dead window(s)`, 'info');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFE DOM MANIPULATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Safely update countdown timer text with null checks
function safeUpdateCountdownText(htmlContent) {
  try {
    // Method 1: Use existing countdownTimer reference
    if (countdownTimer && countdownTimer.parentElement) {
      countdownTimer.parentElement.innerHTML = htmlContent;
      // Re-get the countdown timer element after innerHTML change
      countdownTimer = document.getElementById("countdown-timer");
      return true;
    }
    
    // Method 2: Direct selector fallback
    const countdownText = document.querySelector('.countdown-text');
    if (countdownText) {
      countdownText.innerHTML = htmlContent;
      countdownTimer = document.getElementById("countdown-timer");
      return true;
    }
    
    console.warn('Could not update countdown text - elements not found');
    return false;
  } catch (error) {
    console.error('Error updating countdown text:', error);
    addSystemLog(`❌ Failed to update countdown display: ${error.message}`, 'error');
    return false;
  }
}

// Safely reset countdown timer to initial state
function safeResetCountdownTimer() {
  try {
    // Reset countdown value
    if (countdownTimer) {
      countdownTimer.textContent = '10';
    }
    
    // Reset countdown display
    safeUpdateCountdownText('Confirmation available in: <span id="countdown-timer">10</span> seconds');
    
    // Reset progress bar
    if (countdownProgress) {
      countdownProgress.style.width = '0%';
    }
    
    return true;
  } catch (error) {
    console.error('Error resetting countdown timer:', error);
    addSystemLog(`❌ Failed to reset countdown timer: ${error.message}`, 'error');
    return false;
  }
}
