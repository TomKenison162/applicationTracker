// DOM Elements
const navLinks = document.querySelectorAll('.nav-link');
const pages = document.querySelectorAll('.page');
const authButton = document.getElementById('auth-button');
const fetchEmailsBtn = document.getElementById('fetch-emails-btn');
const statusText = document.getElementById('status-text');
const progressBar = document.getElementById('progress-bar');
const applicationsBody = document.getElementById('applications-body');
const saveApiKeyBtn = document.getElementById('save-api-key');
const apiKeyInput = document.getElementById('api-key-input');
const disconnectBtn = document.getElementById('disconnect-btn');
const connectedEmail = document.getElementById('connected-email');

// Statistics elements
const statApplications = document.getElementById('stat-applications');
const statInterviews = document.getElementById('stat-interviews');
const statOffers = document.getElementById('stat-offers');
const statRejections = document.getElementById('stat-rejections');

// Configuration
const CLIENT_ID = '453979721534-3nf5tank5d8hjmsrnjcqjcakjldfs459.apps.googleusercontent.com';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
let tokenClient;
let accessToken;
let GeminiAPIKey = localStorage.getItem('gemini_api_key');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initGoogleAuth();
    loadSavedSettings();
    setupEventListeners();
    
    if (GeminiAPIKey) {
        apiKeyInput.value = GeminiAPIKey;
    }
});

// Google Auth Initialization
function initGoogleAuth() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: GMAIL_SCOPE,
        callback: handleAuthResponse,
    });

    authButton.onclick = () => {
        tokenClient.requestAccessToken();
    };
}

// Event Listeners
function setupEventListeners() {
    // Navigation
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = link.getAttribute('data-page');
            switchPage(pageId);
            
            // Update active class
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // Fetch emails button
    fetchEmailsBtn.addEventListener('click', fetchAndProcessEmails);

    // Save API key
    saveApiKeyBtn.addEventListener('click', saveAPIKey);

    // Disconnect button
    disconnectBtn.addEventListener('click', disconnectGmail);
}

// Page Navigation
function switchPage(pageId) {
    pages.forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(`${pageId}-page`).classList.add('active');
}

// Handle Google Auth Response
function handleAuthResponse(response) {
    if (response.error) {
        statusText.textContent = "Authentication failed. Please try again.";
        return;
    }
    
    accessToken = response.access_token;
    statusText.textContent = '✅ Authentication successful!';
    authButton.style.display = 'none';
    fetchEmailsBtn.disabled = false;
    
    // Get user email for display
    fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    })
    .then(response => response.json())
    .then(profile => {
        connectedEmail.textContent = profile.emailAddress;
    })
    .catch(error => {
        console.error('Error fetching profile:', error);
    });
}

// Fetch and Process Emails with Gemini AI
async function fetchAndProcessEmails() {
    if (!GeminiAPIKey) {
        statusText.textContent = 'Please add your Gemini API key in Settings first.';
        switchPage('settings');
        return;
    }
    
    statusText.textContent = '🔍 Searching for job application emails...';
    fetchEmailsBtn.disabled = true;
    progressBar.style.width = '10%';

    const query = 'after:2025/09/01 (subject:application OR subject:interview OR subject:"next steps" OR subject:assessment OR subject:offer OR subject:rejection)';
    const encodedQuery = encodeURIComponent(query);

    try {
        // Find emails matching the query
        const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodedQuery}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const listData = await listResponse.json();

        if (!listData.messages || listData.messages.length === 0) {
            statusText.textContent = 'No job application emails found since Sept 1, 2025.';
            progressBar.style.width = '0%';
            return;
        }

        statusText.textContent = `Found ${listData.messages.length} emails. Processing with AI...`;
        progressBar.style.width = '30%';

        // Process each email
        const applications = [];
        for (let i = 0; i < listData.messages.length; i++) {
            const message = listData.messages[i];
            const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const emailData = await msgResponse.json();
            
            // Process email with Gemini AI
            const parsedApp = await parseEmailWithGemini(emailData);
            if (parsedApp) applications.push(parsedApp);
            
            // Update progress
            progressBar.style.width = `${30 + ((i + 1) / listData.messages.length) * 60}%`;
            statusText.textContent = `Processing emails: ${i + 1}/${listData.messages.length}`;
        }

        // Display results
        renderApplications(applications);
        updateStats(applications);
        statusText.textContent = `🎉 Processed ${applications.length} job applications!`;
        
    } catch (error) {
        console.error('Error fetching emails:', error);
        statusText.textContent = '❌ Error fetching emails. Check console for details.';
        progressBar.style.width = '0%';
    } finally {
        fetchEmailsBtn.disabled = false;
    }
}

// Parse email using Gemini AI
async function parseEmailWithGemini(emailData) {
    const headers = emailData.payload.headers;
    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
    const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
    const dateHeader = headers.find(h => h.name.toLowerCase() === 'date')?.value;
    const date = dateHeader ? new Date(dateHeader).toLocaleDateString() : 'Unknown date';
    
    // Extract email body
    let body = '';
    if (emailData.payload.parts) {
        const textPart = emailData.payload.parts.find(part => part.mimeType === 'text/plain');
        if (textPart && textPart.body && textPart.body.data) {
            body = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }
    } else if (emailData.payload.body && emailData.payload.body.data) {
        body = atob(emailData.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    }
    
    // Truncate body if too long
    const maxLength = 4000;
    if (body.length > maxLength) {
        body = body.substring(0, maxLength) + '... [truncated]';
    }
    
    // Call Gemini API
    try {
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=${GeminiAPIKey}`;
        
        const prompt = `Extract job application information from this email. Return ONLY a JSON object with this exact structure:
        {
            "company": "company name",
            "role": "job position or role",
            "status": "Applied/Interview/Assessment/Offer/Rejected",
            "notes": "key details like next steps, deadlines, salary, etc."
        }
        
        Email Subject: ${subject}
        From: ${fromHeader}
        Date: ${date}
        Email Body: ${body}`;

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 500,
                }
            })
        });
        
        const data = await response.json();
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const content = data.candidates[0].content.parts[0].text;
            
            // Extract JSON from the response
            let jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const llmData = JSON.parse(jsonMatch[0]);
                    let company = fromHeader.split('<')[0].replace(/"/g, '').trim();
                    
                    return {
                        company: llmData.company || company,
                        role: llmData.role || 'Unknown Position',
                        date: date,
                        status: llmData.status || 'Applied',
                        subject: subject,
                        notes: llmData.notes || ''
                    };
                } catch (e) {
                    console.error('Error parsing LLM JSON response:', e, 'Response:', content);
                    return null;
                }
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return null;
    }
}

// Render applications to the table
function renderApplications(applications) {
    if (applications.length === 0) {
        applicationsBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">No job applications found</td></tr>';
        return;
    }
    
    let html = '';
    applications.forEach(app => {
        const statusClass = `status-${app.status.toLowerCase()}`;
        html += `
            <tr>
                <td>${app.company}</td>
                <td>${app.role}</td>
                <td>${app.date}</td>
                <td><span class="status-badge ${statusClass}">${app.status}</span></td>
                <td>${app.notes}</td>
            </tr>
        `;
    });
    
    applicationsBody.innerHTML = html;
}

// Update statistics
function updateStats(applications) {
    const total = applications.length;
    const interviews = applications.filter(app => app.status === 'Interview').length;
    const offers = applications.filter(app => app.status === 'Offer').length;
    const rejections = applications.filter(app => app.status === 'Rejected').length;
    
    statApplications.textContent = total;
    statInterviews.textContent = interviews;
    statOffers.textContent = offers;
    statRejections.textContent = rejections;
}

// Save API Key
function saveAPIKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
        GeminiAPIKey = key;
        localStorage.setItem('gemini_api_key', key);
        alert('API key saved successfully!');
    } else {
        alert('Please enter a valid API key');
    }
}

// Disconnect Gmail
function disconnectGmail() {
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken, () => {
            console.log('Access revoked');
        });
    }
    
    accessToken = null;
    authButton.style.display = 'inline-flex';
    fetchEmailsBtn.disabled = true;
    connectedEmail.textContent = 'Not connected';
    statusText.textContent = 'Connect your Gmail to get started';
    applicationsBody.innerHTML = '';
    
    // Reset stats
    statApplications.textContent = '0';
    statInterviews.textContent = '0';
    statOffers.textContent = '0';
    statRejections.textContent = '0';
}

// Load saved settings
function loadSavedSettings() {
    const notifications = localStorage.getItem('notifications');
    const autoSync = localStorage.getItem('auto-sync');
    
    if (notifications !== null) {
        document.getElementById('notifications').checked = notifications === 'true';
    }
    
    if (autoSync !== null) {
        document.getElementById('auto-sync').checked = autoSync === 'true';
    }
}