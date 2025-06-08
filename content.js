// Content script that runs on LinkedIn pages
console.log("LinkedIn Post Extractor: Content script loaded");

// Main initialization code
let enabled = true;
let observer = null;
let allPosts = [];
let processedPosts = new Set();
// Initialize variables for Groq API settings
// TEMPORARY: Hardcoded API key for testing purposes - REMOVE BEFORE PRODUCTION
const AI_SERVER_URL = 'https://groq-api-eta.vercel.app';
let useGroqApi = true; // Force enable API for testing

// Check if on a LinkedIn page
if (isLinkedInPage()) {
  // Load enabled state and Groq settings from storage
  chrome.storage.sync.get(['enabled', 'groqApiKey', 'useGroqApi'], function(result) {
    // If we have a stored value, use it, otherwise default to true
    if (result.hasOwnProperty('enabled')) {
      enabled = result.enabled;
    }
    
    // Load Groq API settings if available
    if (result.hasOwnProperty('groqApiKey')) {
      groqApiKey = result.groqApiKey;
    }
    
    if (result.hasOwnProperty('useGroqApi')) {
      useGroqApi = result.useGroqApi;
    }
    
    console.log(`FactSlap initialized with useGroqApi: ${useGroqApi}`);
    
    // Set up the extension
    setupExtension();
  });
} else {
  console.log('Not on LinkedIn, extension inactive');
}

// Function to check if current page is LinkedIn
function isLinkedInPage() {
  return window.location.hostname.includes('linkedin.com');
}

// AI detection function using Groq API
async function analyzeAiProbability(text, author) {
  // If API key is not set, API is disabled, or text is too short, return null
  // if (!useGroqApi || !groqApiKey || text.length < 20) {
  //   console.log('API not available or text too short - no analysis performed');
  //   return null;
  // }
  
  try {
    // Use Groq API for analysis
    return await groqAnalyzeContent(text);
  } catch (error) {
    console.error('Error using Groq API:', error);
    // Return null to indicate no analysis
    return null;
  }
}

// Groq API integration for AI content detection
async function groqAnalyzeContent(text) {
  try {
    const resp = await fetch(`${AI_SERVER_URL}/ai-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!resp.ok) {
      console.error('AI service error', resp.status);
      return null;
    }
    const { probability } = await resp.json();
    return probability;
  } catch (e) {
    console.error('AI service error', e);
    return null;
  }
}

// No local analysis function - removed as requested

// Function to process a single post container
async function processPost(postContainer) {
  console.log('Processing post container:', postContainer);
  
  // Generate a unique ID for the post to avoid duplicates
  // Using the innerText of the post as a simple hash
  const descriptionContainer = postContainer.querySelector('.feed-shared-update-v2__description');
  if (!descriptionContainer) {
    console.log('No description container found');
    return;
  }
  
  const textElement = descriptionContainer.querySelector('.update-components-text');
  if (!textElement) {
    console.log('No text element found');
    return;
  }
  
  const postText = textElement.textContent.trim();
  // Simple hash function for identifying posts
  const postId = postText.substring(0, 50) + '-' + postText.length;
  
  // Skip if we've already processed this post
  if (processedPosts.has(postId)) return;
  processedPosts.add(postId);
  
  // Get author info
  const authorElement = postContainer.querySelector('.update-components-actor__title .hoverable-link-text');
  const author = authorElement ? authorElement.textContent.trim() : 'Unknown';
  
  // First add a loading indicator badge
  const loadingBadge = addLoadingBadge(postContainer);
  
  try {
    // Analyze the post with Groq API (now async)
    let aiProbability;
    if (postText.length > 150) {
      aiProbability = await analyzeAiProbability(postText, author);
    }
    
    // Add to our collection of posts
    allPosts.push({
      index: allPosts.length + 1,
      author: author,
      description: postText,
      id: postId,
      aiProbability: aiProbability,
      analyzed: aiProbability !== null
    });
    
    // Remove loading indicator and add the appropriate badge
    if (loadingBadge) loadingBadge.remove();
    
    if (!aiProbability) {
      // If no analysis available, add a "No Analysis" badge
      addNoAnalysisBadge(postContainer);
      console.log(`New post detected: ${author} (No AI analysis available)`);
    } else {
      // If analysis is available, add the AI probability badge
      addAiProbabilityBadge(postContainer, aiProbability);
      console.log(`New post detected: ${author} (AI Probability: ${aiProbability}%)`);
    }
    
    // Send update message to popup
    chrome.runtime.sendMessage({
      action: "posts_updated",
      posts: allPosts,
      count: allPosts.length
    });
  } catch (error) {
    console.error('Error analyzing post:', error);
    // If there was an error, still add the post but mark as not analyzed
    allPosts.push({
      index: allPosts.length + 1,
      author: author,
      description: postText,
      id: postId,
      aiProbability: null,
      analyzed: false,
      error: true
    });
    
    // Remove loading indicator and add a error badge
    if (loadingBadge) loadingBadge.remove();
    addNoAnalysisBadge(postContainer, true);
    
    // Send update message to popup
    chrome.runtime.sendMessage({
      action: "posts_updated",
      posts: allPosts,
      count: allPosts.length
    });
  }
}

// Function to add a loading badge while analyzing
function addLoadingBadge(postContainer) {
  // Check if badge already exists
  if (postContainer.querySelector('.factslap-loading-badge, .factslap-ai-badge')) return null;
  
  // Create the loading badge element
  const badge = document.createElement('div');
  badge.className = 'factslap-loading-badge';
  
  // Style the badge
  badge.style.cssText = `
    position: absolute;
    top: 10px;
    right: 70px;
    padding: 3px 10px;
    border-radius: 12px;
    background-color: #757575;
    color: white;
    font-size: 12px;
    font-weight: bold;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255,255,255,0.3);
  `;
  
  // Add loading text and spinner
  badge.innerHTML = `
    <div class="loading-spinner" style="
      width: 12px;
      height: 12px;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 1s linear infinite;
      margin-right: 6px;
    "></div>
    <span>Analyzing...</span>
  `;
  
  // Add keyframes for the loading spinner animation
  if (!document.querySelector('#loading-spinner-keyframes')) {
    const style = document.createElement('style');
    style.id = 'loading-spinner-keyframes';
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Find a good position for the badge
  const targetElement = postContainer.querySelector('.feed-shared-control-menu');
  if (targetElement) {
    targetElement.parentNode.style.position = 'relative';
    targetElement.parentNode.insertBefore(badge, targetElement);
  } else {
    postContainer.style.position = 'relative';
    postContainer.appendChild(badge);
  }
  
  return badge;
}

// Function to add AI probability badge to a post
function addAiProbabilityBadge(postContainer, probability) {
  // Check if badge already exists
  if (postContainer.querySelector('.factslap-ai-badge, .factslap-no-analysis-badge')) return;
  
  // Create the indicator element
  const badge = document.createElement('div');
  badge.className = 'factslap-ai-badge';
  
  // Determine color and text based on AI probability
  let color, statusText, icon;
  
  if (probability >= 75) {
    color = '#D32F2F'; // Red for high probability
    statusText = 'High likelihood of AI-generated content';
    icon = '🤖';
  } else if (probability >= 50) {
    color = '#FF9800'; // Orange for medium probability
    statusText = 'Medium likelihood of AI-generated content';
    icon = '🤔';
  } else if (probability >= 25) {
    color = '#FFD600'; // Yellow for low-medium probability
    statusText = 'Low-medium likelihood of AI-generated content';
    icon = '⚠️';
  } else {
    color = '#43A047'; // Green for low probability
    statusText = 'Low likelihood of AI-generated content';
    icon = '✓';
  }
  
  // Set the tooltip
  badge.title = statusText;
  
  // Add the icon and text
  badge.innerHTML = `${icon} <span>${probability}% AI</span>`;
  
  // Style the badge
  badge.style.cssText = `
    position: absolute;
    top: 10px;
    right: 70px;
    padding: 3px 10px;
    border-radius: 12px;
    background-color: ${color};
    color: white;
    font-size: 12px;
    font-weight: bold;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 4px;
    border: 1px solid rgba(255,255,255,0.3);
  `;
  
  // Add click event to show more info
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Check if an info panel already exists
    let infoPanel = postContainer.querySelector('.factslap-info-panel');
    
    if (infoPanel) {
      // Toggle visibility if it exists
      infoPanel.style.display = infoPanel.style.display === 'none' ? 'block' : 'none';
      return;
    }
    
    // Create info panel
    infoPanel = document.createElement('div');
    infoPanel.className = 'factslap-info-panel';
    
    // Style the info panel
    infoPanel.style.cssText = `
      position: absolute;
      top: 40px;
      right: 70px;
      width: 250px;
      padding: 10px;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 101;
      font-size: 13px;
      border: 1px solid ${color};
    `;
    
    // Add content to the info panel
    infoPanel.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; color: ${color}">
        ${icon} AI Content Probability: ${probability}%
      </div>
      <p style="margin: 0 0 10px 0;">${statusText}</p>
      <div style="font-size: 11px; color: #666;">
        Analysis performed by Groq AI.
      </div>
    `;
    
    // Add the info panel to the post container
    postContainer.appendChild(infoPanel);
  });
  
  // Find a good position for the badge
  const targetElement = postContainer.querySelector('.feed-shared-control-menu');
  if (targetElement) {
    targetElement.parentNode.style.position = 'relative';
    targetElement.parentNode.insertBefore(badge, targetElement);
  } else {
    postContainer.style.position = 'relative';
    postContainer.appendChild(badge);
  }
  
  return badge;
}

// Function to add a badge for posts with no analysis
function addNoAnalysisBadge(postContainer, isError = false) {
  // Check if badge already exists
  if (postContainer.querySelector('.factslap-ai-badge, .factslap-no-analysis-badge')) return;
  
  // Create the indicator element
  const badge = document.createElement('div');
  badge.className = 'factslap-no-analysis-badge';
  
  // Set badge text and style based on whether it's an error or just unavailable
  let color, statusText, icon, badgeText;
  
  if (isError) {
    color = '#757575'; // Gray for error
    statusText = 'Error analyzing content';
    icon = '⚠️';
    badgeText = 'Analysis Error';
  } else {
    color = '#9E9E9E'; // Light gray for no analysis
    statusText = 'AI analysis not available';
    icon = 'ℹ️';
    badgeText = 'No Analysis';
  }
  
  // Set the tooltip
  badge.title = statusText;
  
  // Add the icon and text
  badge.innerHTML = `${icon} <span>${badgeText}</span>`;
  
  // Style the badge
  badge.style.cssText = `
    position: absolute;
    top: 10px;
    right: 70px;
    padding: 3px 10px;
    border-radius: 12px;
    background-color: ${color};
    color: white;
    font-size: 12px;
    font-weight: bold;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 4px;
    border: 1px solid rgba(255,255,255,0.3);
  `;
  
  // Add click event to show more info
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Check if an info panel already exists
    let infoPanel = postContainer.querySelector('.factslap-info-panel');
    
    if (infoPanel) {
      // Toggle visibility if it exists
      infoPanel.style.display = infoPanel.style.display === 'none' ? 'block' : 'none';
      return;
    }
    
    // Create info panel
    infoPanel = document.createElement('div');
    infoPanel.className = 'factslap-info-panel';
    
    // Style the info panel
    infoPanel.style.cssText = `
      position: absolute;
      top: 40px;
      right: 70px;
      width: 250px;
      padding: 10px;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 101;
      font-size: 13px;
      border: 1px solid ${color};
    `;
    
    // Add content to the info panel
    infoPanel.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; color: ${color}">
        ${icon} ${badgeText}
      </div>
      <p style="margin: 0 0 10px 0;">${statusText}</p>
      <div style="font-size: 11px; color: #666;">
        ${isError ? 
          'There was an error connecting to the Groq API. Check your API key and connection.' : 
          'Analysis requires a valid Groq API key. Click the "FactSlap AI Detector" button in the top-right corner to configure.'}
      </div>
    `;
    
    // Add the info panel to the post container
    postContainer.appendChild(infoPanel);
  });
  
  // Find a good position for the badge
  const badgeTargetElement = postContainer.querySelector('.feed-shared-control-menu');
  if (badgeTargetElement) {
    badgeTargetElement.parentNode.style.position = 'relative';
    badgeTargetElement.parentNode.insertBefore(badge, badgeTargetElement);
  } else {
    postContainer.style.position = 'relative';
    postContainer.appendChild(badge);
  }
  
  return badge;
  
  // Set the tooltip
  badge.title = statusText;
  
  // Style the indicator as a badge
  badge.style.cssText = `
    position: absolute;
    top: 10px;
    right: 80px; /* Increased right margin to avoid overlapping with LinkedIn's controls */
    padding: 3px 10px;
    border-radius: 12px;
    background-color: ${color};
    color: white;
    font-size: 12px;
    font-weight: bold;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: 1px solid rgba(255,255,255,0.3);
  `;
  
  // Add icon
  const iconSpan = document.createElement('span');
  iconSpan.textContent = icon + ' ';
  iconSpan.style.marginRight = '4px';
  badge.appendChild(iconSpan);
  
  // Add content to the badge
  badge.appendChild(probabilityText);
  
  // Add click behavior to show detailed analysis
  badge.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering LinkedIn's click handlers
    
    // Toggle detailed info panel
    let infoPanel = postContainer.querySelector('.factslap-info-panel');
    
    if (infoPanel) {
      // If panel exists, toggle visibility
      infoPanel.style.display = infoPanel.style.display === 'none' ? 'block' : 'none';
      return;
    }
    
    // Create info panel if it doesn't exist
    infoPanel = document.createElement('div');
    infoPanel.className = 'factslap-info-panel';
    
    // Style the panel
    infoPanel.style.cssText = `
      position: absolute;
      top: 40px;
      right: 70px; /* Match the badge position */
      width: 250px;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 101;
      padding: 12px;
      font-size: 13px;
      color: #333;
      border: 1px solid #e0e0e0;
    `;
    
    // Add content to the panel
    infoPanel.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; color: ${color}">
        ${icon} AI Detection Results
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Probability:</strong> ${probability}%
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Assessment:</strong> ${statusText}
      </div>
      <div style="font-style: italic; font-size: 11px; color: #666;">
        This is a preliminary assessment. Click for more details.
      </div>
    `;
    
    // Add the panel to the post container
    postContainer.style.position = 'relative'; // Ensure positioning context
    postContainer.appendChild(infoPanel);
  });
  
  // Find a good position for the badge
  const targetElement = postContainer.querySelector('.feed-shared-control-menu');
  if (targetElement) {
    // Position relative to the control menu
    targetElement.parentNode.style.position = 'relative';
    targetElement.parentNode.insertBefore(badge, targetElement);
  } else {
    // Fallback - append to the post container
    postContainer.style.position = 'relative'; // Ensure positioning context
    postContainer.appendChild(badge);
  }
}

// Function to extract post descriptions from LinkedIn feed
function extractPostDescriptions() {
  // Reset our collection
  allPosts = [];
  
  // Find all post containers
  const postContainers = document.querySelectorAll('.feed-shared-update-v2__control-menu-container');
  
  postContainers.forEach((container) => {
    processPost(container);
  });
  
  return allPosts;
}

// Set up MutationObserver to detect new posts as they're loaded
function observeNewPosts() {
  console.log('Setting up observer for LinkedIn posts');
  
  // First, process any existing posts
  console.log('Looking for existing posts on the page');
  const existingPosts = document.querySelectorAll('.feed-shared-update-v2__control-menu-container');
  console.log(`Found ${existingPosts.length} existing posts`);
  
  // Process existing posts - now with async handling
  existingPosts.forEach(post => {
    // processPost is async but we don't need to await it here
    // each post processes independently
    processPost(post).catch(err => {
      console.error('Error processing existing post:', err);
    });
  });
  
  // Create the observer
  const observer = new MutationObserver((mutations) => {
    console.log(`Mutation observer triggered with ${mutations.length} mutations`);
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Try different selectors to find LinkedIn posts
            let postContainers = [];
            
            // Original selector
            const menuContainers = node.querySelectorAll('.feed-shared-update-v2__control-menu-container');
            if (menuContainers.length > 0) {
              postContainers = postContainers.concat(Array.from(menuContainers));
            }
            
            // Alternative selectors
            const updateNodes = node.querySelectorAll('.feed-shared-update-v2');
            if (updateNodes.length > 0) {
              postContainers = postContainers.concat(Array.from(updateNodes));
            }
            
            if (postContainers.length > 0) {
              console.log(`Found ${postContainers.length} new posts to process`);
              
              // Process each post asynchronously
              postContainers.forEach((postContainer) => {
                processPost(postContainer).catch(err => {
                  console.error('Error processing new post:', err);
                });
              });
            }
          }
        });
      }
    });
  });

  // Start observing with configuration
  observer.observe(document.body, { childList: true, subtree: true });
  console.log("LinkedIn Post Extractor: Observer started");
  
  // Add a visible marker to the page to show the extension is active
  const marker = document.createElement('div');
  marker.textContent = 'FactSlap AI Detector';
  marker.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background-color: #0077B5;
    color: white;
    padding: 5px 10px;
    border-radius: 4px;
    z-index: 9999;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
  `;
  
  // Add API key input functionality
  marker.addEventListener('click', () => {
    // Create or show the settings panel
    let settingsPanel = document.querySelector('.factslap-settings-panel');
    
    if (settingsPanel) {
      // Toggle visibility if it exists
      settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
      return;
    }
    
    // Create settings panel
    settingsPanel = document.createElement('div');
    settingsPanel.className = 'factslap-settings-panel';
    settingsPanel.style.cssText = `
      position: fixed;
      top: 40px;
      right: 10px;
      width: 300px;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9998;
      padding: 15px;
      color: #333;
    `;
    
    // Add content to settings panel
    settingsPanel.innerHTML = `
      <h3 style="margin-top: 0; color: #0077B5;">FactSlap Settings</h3>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Groq API Key</label>
        <input type="password" id="groq-api-key" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="Enter your Groq API key" value="${groqApiKey}">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: flex; align-items: center;">
          <input type="checkbox" id="use-groq-api" ${useGroqApi ? 'checked' : ''}>
          <span style="margin-left: 8px;">Use Groq API for AI detection</span>
        </label>
      </div>
      <button id="save-settings" style="background: #0077B5; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Save Settings</button>
    `;
    
    document.body.appendChild(settingsPanel);
    
    // Add event listener to save button
    document.getElementById('save-settings').addEventListener('click', () => {
      const apiKey = document.getElementById('groq-api-key').value;
      const useApi = document.getElementById('use-groq-api').checked;
      
      // Update global variables
      groqApiKey = apiKey;
      useGroqApi = useApi;
      
      // Save to storage
      chrome.storage.sync.set({
        groqApiKey: apiKey,
        useGroqApi: useApi
      }, () => {
        console.log('Groq API settings saved');
      });
      
      // Hide settings panel
      settingsPanel.style.display = 'none';
      
      // Show notification
      const notification = document.createElement('div');
      notification.textContent = 'Settings saved!';
      notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #43A047;
        color: white;
        padding: 10px 15px;
        border-radius: 4px;
        z-index: 10000;
      `;
      document.body.appendChild(notification);
      
      // Remove notification after 3 seconds
      setTimeout(() => {
        notification.remove();
      }, 3000);
    });
  });
  
  document.body.appendChild(marker);
  
  return observer;
}

// Function to set up the extension based on enabled state
function setupExtension() {
  if (enabled) {
    console.log('Extension is enabled, setting up...');
    // Scan for existing posts
    extractPostDescriptions();
    
    // Set up the observer for new posts
    if (!observer) {
      observer = observeNewPosts();
    }
  } else {
    console.log('Extension is disabled');
    // Clean up if disabled
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    
    // Remove any existing UI elements
    document.querySelectorAll('.factslap-ai-badge, .factslap-loading-badge, .factslap-settings-panel').forEach(el => {
      el.remove();
    });
  }
}

// Listen for changes to enabled state from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "toggle_enabled") {
    enabled = request.enabled;
    // Save the new state
    chrome.storage.sync.set({enabled: enabled});
    // Update the extension setup
    setupExtension();
    sendResponse({status: `Extension ${enabled ? 'enabled' : 'disabled'}`});
  }
});

// Basic listener for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "scan_linkedin_page") {
    console.log("Checking if current page is LinkedIn");
    
    // Check if we're on a LinkedIn page
    if (!isLinkedInPage()) {
      sendResponse({status: "This extension only works on LinkedIn pages"});
      return true;
    }
    
    console.log("Scanning LinkedIn page for post descriptions");
    
    try {
      // Re-extract to make sure we have the latest
      const posts = extractPostDescriptions();
      
      if (posts.length > 0) {
        sendResponse({
          status: `Found ${posts.length} posts`,
          posts: posts
        });
      } else {
        sendResponse({status: "No posts found on this page"});
      }
    } catch (error) {
      console.error("Error extracting post descriptions:", error);
      sendResponse({status: `Error: ${error.message}`});
    }
  }
  return true;  // Indicates we're handling the message asynchronously
});
