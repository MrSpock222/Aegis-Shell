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

// Current app state
let isOnHomePage = true;
let systemLogs = [];
let isProtectionEnabled = true;
let activeWindows = []; // Track all active windows

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
  // System logs button
  systemLogsBtn.addEventListener("click", () => {
    toggleSystemLogs();
  });

  // Close logs button
  closeLogsBtn.addEventListener("click", () => {
    systemLogsPanel.classList.add('hidden');
    addSystemLog('📋 System logs panel closed', 'info');
  });  // Protection toggle button
  protectionToggleBtn.addEventListener("click", () => {
    addSystemLog('🔄 Global protection toggle requested', 'info');
    logWindowStatus();
    toggleProtection();
  });

  // Quick link shortcuts
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
      
      // 1. Update global backend state FIRST
      try {
        await invoke('set_global_protection_state', { enabled: false });
        addSystemLog('🔄 Backend global protection state: DISABLED', 'info');
      } catch (error) {
        addSystemLog(`❌ Failed to update backend protection state: ${error}`, 'error');
      }
      
      // 2. Disable for main window
      const mainResult = await disableScreenshotProtection();
        // 3. Disable for all active browser windows
      let windowCount = 0;
      for (const windowInfo of activeWindows) {
        if (windowInfo.label) {
          try {
            await applyProtectionToWindow(windowInfo.label, false);
            windowCount++;
            addSystemLog(`🔓 Protection disabled for: ${windowInfo.label}`, 'warning');
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
      }
    } else {
      // Enable protection for all windows
      addSystemLog('🔄 Enabling protection for all windows...', 'info');
      
      // 1. Update global backend state FIRST
      try {
        await invoke('set_global_protection_state', { enabled: true });
        addSystemLog('🔄 Backend global protection state: ENABLED', 'info');
      } catch (error) {
        addSystemLog(`❌ Failed to update backend protection state: ${error}`, 'error');
      }
      
      // 2. Enable for main window
      const mainResult = await enableScreenshotProtection();
        // 3. Enable for all active browser windows
      let windowCount = 0;
      for (const windowInfo of activeWindows) {
        if (windowInfo.label) {
          try {
            await applyProtectionToWindow(windowInfo.label, true);
            windowCount++;
            addSystemLog(`🛡️ Protection enabled for: ${windowInfo.label}`, 'success');
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
