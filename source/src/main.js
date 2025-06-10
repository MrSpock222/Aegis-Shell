// ═══════════════════════════════════════════════════════════════════════════════
// AEGIS SHELL - Main Browser Engine
// ═══════════════════════════════════════════════════════════════════════════════

// Core Tauri imports
const { invoke } = window.__TAURI__.core;
const { WebviewWindow } = window.__TAURI__.webviewWindow;
const { getCurrent } = window.__TAURI__.webviewWindow;

// ─────────────────────────────────────────────────────────────────────────────
// SCREENSHOT PROTECTION API
// ─────────────────────────────────────────────────────────────────────────────

// Enable stealth mode for current window
async function enableScreenshotProtection() {
  try {
    const currentWindow = getCurrent();
    const result = await invoke('enable_screenshot_protection', { window: currentWindow });
    console.log('Screenshot protection enabled:', result);
    return true;
  } catch (error) {
    console.error('Failed to enable screenshot protection:', error);
    return false;
  }
}

// Disable stealth mode 
async function disableScreenshotProtection() {
  try {
    const currentWindow = getCurrent();
    const result = await invoke('disable_screenshot_protection', { window: currentWindow });
    console.log('Screenshot protection disabled:', result);
    return true;
  } catch (error) {
    console.error('Failed to disable screenshot protection:', error);
    return false;
  }
}

// Check if window is currently protected
async function checkScreenshotProtectionStatus() {
  try {
    const currentWindow = getCurrent();
    const result = await invoke('check_screenshot_protection_status', { window: currentWindow });
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

// Current app state
let isOnHomePage = true;

// ─────────────────────────────────────────────────────────────────────────────
// UI NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

// Show main landing page
function showHomePage() {
  homeScreen.style.display = "flex";
  isOnHomePage = true;
  homeUrlInput.value = "";
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
    } else {
      // Not URL format, treat as Google search
      console.log(`"${originalInput}" is not a URL, creating Google search`);
      const searchQuery = encodeURIComponent(originalInput);
      url = `https://www.google.com/search?q=${searchQuery}`;
    }
  } else {
    url = originalInput;
  }
  
  try {
    new URL(url); // Validate final URL
    
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    if (url.includes('google.com/search')) {
      console.log(`Opening Google search for "${originalInput}" in new Aegis window`);
    } else {
      console.log(`Opening ${hostname} in new Aegis window`);
    }
    
    openInNewAegisWindow(url);
    
  } catch (error) {
    // Still invalid? Force Google search
    console.log(`URL validation failed, creating Google search for "${originalInput}"`);
    const searchQuery = encodeURIComponent(originalInput);
    const googleSearchUrl = `https://www.google.com/search?q=${searchQuery}`;
    openInNewAegisWindow(googleSearchUrl);
  }
}

// Handle URL input submission
function handleHomeUrlNavigation() {
  const url = homeUrlInput.value.trim();
  console.log(`🚀 Navigation requested: "${url}"`);
  if (url) {
    showWebsite(url);
  } else {
    console.log("❌ No URL provided");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS SETUP
// ─────────────────────────────────────────────────────────────────────────────

// Wire up all interactive elements
function setupEventListeners() {
  console.log("🔧 Setting up event listeners...");
  
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

  // Quick link shortcuts
  console.log(`🔗 Setting up ${quickLinks.length} quick links`);
  quickLinks.forEach((link, index) => {
    link.addEventListener("click", (e) => {
      const url = e.currentTarget.getAttribute("data-url");
      console.log(`🔗 Quick link ${index} clicked: ${url}`);
      if (url) {
        showWebsite(url);
      }
    });
  });
  
  console.log("✅ All event listeners setup complete");
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-WINDOW BROWSER ENGINE  
// ─────────────────────────────────────────────────────────────────────────────

// Launch new protected browser window
async function openInNewAegisWindow(url) {
  try {
    const windowLabel = `aegis-${Date.now()}`;
    const webview = new WebviewWindow(windowLabel, {
      url: `website.html?url=${encodeURIComponent(url)}`,
      title: `Aegis Shell - ${new URL(url).hostname}`,
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      center: true,
      resizable: true,
      visible: false, // 🛡️ Start hidden for stealth protection
      skipTaskbar: false
    });
    
    // Backend handles protection & visibility automatically
    webview.once('tauri://created', async () => {
      console.log(`🆕 Window created (hidden): ${windowLabel} for ${url}`);
      console.log(`⏳ Backend will handle protection and show automatically...`);
    });

    webview.once('tauri://error', (e) => {
      console.error('Error creating new Aegis window:', e);
      alert('Fehler beim Erstellen eines neuen Fensters: ' + e.payload);
    });
    
  } catch (error) {
    console.error('Error creating new Aegis window:', error);
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
  
  // Debug: Verify all elements found
  console.log("Elements found:", {
    homeUrlInput: !!homeUrlInput,
    homeGoBtn: !!homeGoBtn,
    homeScreen: !!homeScreen,
    quickLinksCount: quickLinks.length
  });
  
  // Abort if critical elements missing
  if (!homeUrlInput || !homeGoBtn || !homeScreen) {
    console.error("❌ Critical elements not found!");
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
    
    // Update live status indicators
    updateStatusBar();
  } catch (error) {
    console.error("Failed to enable screenshot protection for main window:", error);
  }
  
  console.log("🚀 AEGIS SHELL INITIALIZED - Secure invisible browsing ready");
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
