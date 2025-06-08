document.addEventListener('DOMContentLoaded', function() {
  const toggleSwitch = document.getElementById('toggle-switch');
  const statusText = document.getElementById('status-text');
  const resultsDiv = document.getElementById('results');
  let lastUpdateTime = new Date();

  // Load the current state from storage
  chrome.storage.sync.get(['enabled'], function(result) {
    const isEnabled = result.enabled !== undefined ? result.enabled : true; // Default to enabled
    toggleSwitch.checked = isEnabled;
    updateStatusText(isEnabled);
    
    // If extension is enabled, scan immediately when popup opens
    if (isEnabled) {
      scanLinkedInPage();
    } else {
      resultsDiv.innerHTML = '<p>Extension is currently disabled. Enable it to scan for posts.</p>';
    }
  });

  // Toggle switch event listener
  toggleSwitch.addEventListener('change', function() {
    const isEnabled = toggleSwitch.checked;
    
    // Save state to storage
    chrome.storage.sync.set({enabled: isEnabled}, function() {
      console.log('Extension enabled state saved:', isEnabled);
    });
    
    updateStatusText(isEnabled);
    
    // If enabled, scan the page immediately
    if (isEnabled) {
      scanLinkedInPage();
    } else {
      resultsDiv.innerHTML = '<p>Extension is currently disabled. Enable it to scan for posts.</p>';
    }
  });
  
  // Listen for messages from the content script about new posts
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "posts_updated" && toggleSwitch.checked) {
      // Make sure we're not updating too frequently (prevent UI flicker)
      const now = new Date();
      if (now - lastUpdateTime > 1000) { // Only update once per second max
        console.log(`Received update with ${request.count} posts`);
        lastUpdateTime = now;
        
        // Update the UI with the new posts
        displayPosts(request.posts, `Live update: Found ${request.count} posts`);
      }
    }
  });
  
  // Function to update the status text
  function updateStatusText(isEnabled) {
    statusText.textContent = isEnabled ? 'Enabled' : 'Disabled';
    statusText.className = isEnabled ? 'status-enabled' : 'status-disabled';
  }
  
  // Function to display posts in the UI
  function displayPosts(posts, statusMessage) {
    // Create HTML to display the status and post descriptions
    let resultsHTML = `<p>Status: ${statusMessage}</p>`;
    
    // Check if posts were found and returned
    if (posts && posts.length > 0) {
      resultsHTML += '<div class="posts-container">';
      
      // Loop through each post and add it to the HTML
      posts.forEach(post => {
        // Check if the post was analyzed
        if (post.aiProbability === null) {
          // No analysis available
          let aiProbColor, aiProbLabel, icon, statusHTML;
          
          if (post.error) {
            // Error during analysis
            aiProbColor = '#757575';
            aiProbLabel = 'Analysis Error';
            icon = '⚠️';
            statusHTML = 'Error connecting to Groq API';
          } else {
            // No analysis (API not enabled)
            aiProbColor = '#9E9E9E';
            aiProbLabel = 'No Analysis';
            icon = 'ℹ️';
            statusHTML = 'AI analysis not available - configure Groq API';
          }
          
          resultsHTML += `
            <div class="post-item">
              <div class="post-header">
                <h3>Post #${post.index} by ${post.author}</h3>
                <div class="ai-probability-indicator" style="background-color: ${aiProbColor}">
                  ${icon} ${aiProbLabel}
                </div>
              </div>
              <div class="ai-assessment">${statusHTML}</div>
              <div class="post-description">${post.description}</div>
            </div>
            <hr>
          `;
        } else {
          // Post was analyzed, show AI probability
          let aiProbColor, aiProbLabel, icon;
          const probability = post.aiProbability;
          
          if (probability >= 75) {
            aiProbColor = '#D32F2F';
            aiProbLabel = 'High AI probability';
            icon = '🤖';
          } else if (probability >= 50) {
            aiProbColor = '#FF9800';
            aiProbLabel = 'Medium AI probability';
            icon = '🤔';
          } else if (probability >= 25) {
            aiProbColor = '#FFD600';
            aiProbLabel = 'Low-medium AI probability';
            icon = '⚠️';
          } else {
            aiProbColor = '#43A047';
            aiProbLabel = 'Low AI probability';
            icon = '✓';
          }
          
          resultsHTML += `
            <div class="post-item">
              <div class="post-header">
                <h3>Post #${post.index} by ${post.author}</h3>
                <div class="ai-probability-indicator" style="background-color: ${aiProbColor}">
                  ${icon} ${probability}% AI
                </div>
              </div>
              <div class="ai-assessment">${aiProbLabel}</div>
              <div class="post-description">${post.description}</div>
            </div>
            <hr>
          `;
        }
      });
      
      resultsHTML += '</div>';
    }
    
    // Update the results div with the generated HTML
    resultsDiv.innerHTML = resultsHTML;
  }
  
  // Function to scan LinkedIn page
  function scanLinkedInPage() {
    resultsDiv.innerHTML = '<p>Status: Scanning LinkedIn page for posts...</p>';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      // Check if we're on a LinkedIn page
      if (!tabs[0] || !tabs[0].url.includes('linkedin.com')) {
        resultsDiv.innerHTML = '<p>Status: Not on LinkedIn. Please navigate to LinkedIn.com and try again.</p>';
        return;
      }
      
      try {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {action: "scan_linkedin_page"},
          function(response) {
            // Check for runtime error (connection issue)
            if (chrome.runtime.lastError) {
              console.error('Error sending message:', chrome.runtime.lastError);
              resultsDiv.innerHTML = `
                <p>Status: Could not connect to the content script.</p>
                <p>This could be because:</p>
                <ul>
                  <li>The extension needs to be reloaded</li>
                  <li>You need to refresh the LinkedIn page</li>
                </ul>
                <p>Try refreshing the page and then clicking the extension icon again.</p>
              `;
              return;
            }
            
            if (response && response.status) {
              displayPosts(response.posts, response.status);
            } else {
              resultsDiv.innerHTML = '<p>Status: No results found or the page is still loading</p>';
            }
          }
        );
      } catch (error) {
        console.error('Error scanning page:', error);
        resultsDiv.innerHTML = '<p>Status: Error scanning page. Please reload the extension.</p>';
      }
    });
  }
});
