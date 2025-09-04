// --- CONFIGURATION ---
const CLIENT_ID = '453979721534-f4n0mtig7qc506veahvja29c24t3enu4.apps.googleusercontent.com'; // ⚠️ PASTE YOUR CLIENT ID HERE
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
let tokenClient;
let accessToken;

// --- DOM ELEMENTS ---
const loginButton = document.getElementById('login-button');
const fetchButton = document.getElementById('fetch-button');
const statusDiv = document.getElementById('status');
const trackerContainer = document.getElementById('tracker-container');
const progressBar = document.getElementById('progress-bar');
const statsContainer = document.getElementById('stats-container');
const statTotal = document.getElementById('stat-total');
const statInterviews = document.getElementById('stat-interviews');
const statOffers = document.getElementById('stat-offers');
const statRejections = document.getElementById('stat-rejections');

// --- INITIALIZATION ---
window.onload = () => {
    // 1. Initialize the Google Auth client
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: GMAIL_SCOPE,
        callback: handleAuthResponse,
    });
    loginButton.onclick = () => tokenClient.requestAccessToken();
    fetchButton.onclick = fetchAndProcessEmails;
};

// --- AUTHENTICATION LOGIC ---
function handleAuthResponse(response) {
    if (response.error) {
        statusDiv.innerText = "Authentication failed. Please try again.";
        return;
    }
    accessToken = response.access_token;
    statusDiv.innerHTML = '✅ <strong>Authentication successful!</strong> Click "Fetch & Track Applications" to continue.';
    loginButton.disabled = true;
    fetchButton.disabled = false;
}

// --- GMAIL API & PROCESSING LOGIC ---
async function fetchAndProcessEmails() {
    statusDiv.innerHTML = '🔍 <strong>Searching for application emails...</strong>';
    fetchButton.disabled = true;
    progressBar.style.width = '10%';

    // 2. Construct the search query for the Gmail API
    const query = 'after:2025/09/01 (subject:application OR subject:interview OR subject:"next steps" OR subject:assessment OR subject:offer OR subject:rejection)';
    const encodedQuery = encodeURIComponent(query);

    try {
        // 3. Find all emails matching the query
        const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodedQuery}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const listData = await listResponse.json();

        if (!listData.messages || listData.messages.length === 0) {
            statusDiv.innerText = 'No application-related emails found since Sept 1, 2025.';
            progressBar.style.width = '0%';
            return;
        }

        statusDiv.innerHTML = `<strong>Found ${listData.messages.length} emails. Processing with AI...</strong>`;
        progressBar.style.width = '30%';

        // 4. Fetch the full content of each email
        const applications = [];
        let processed = 0;
        
        for (const message of listData.messages) {
            const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const emailData = await msgResponse.json();
            
            // Process email with LLM simulation
            const parsedApp = await parseEmailWithLLM(emailData);
            
            if (parsedApp) applications.push(parsedApp);
            
            processed++;
            progressBar.style.width = `${30 + (processed / listData.messages.length) * 60}%`;
            statusDiv.innerHTML = `<strong>Processing emails: ${processed}/${listData.messages.length}</strong>`;
        }

        renderTracker(applications);
        updateStats(applications);
        statusDiv.innerHTML = `<strong>🎉 Tracker generated with ${applications.length} applications!</strong>`;
        progressBar.style.width = '100%';

    } catch (error) {
        console.error('Error fetching emails:', error);
        statusDiv.innerHTML = '❌ <strong>Error fetching emails. Check console for details.</strong>';
        progressBar.style.width = '0%';
    } finally {
        fetchButton.disabled = false;
    }
}

// --- LLM SIMULATION ---
// In a real implementation, this would call an external LLM API
async function parseEmailWithLLM(emailData) {
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
    
    // Simulate LLM processing with rules and pattern matching
    return simulateLLMProcessing(subject, fromHeader, body, date);
}

function simulateLLMProcessing(subject, from, body, date) {
    // Extract company name from the "from" field
    let company = from.split('<')[0].replace(/"/g, '').trim();
    
    // Default application data
    const application = {
        company: company,
        role: 'Unknown Position',
        date: date,
        status: 'Applied',
        subject: subject,
        notes: ''
    };
    
    // Use patterns to extract role information
    const rolePatterns = [
        /(?:position|role|applying for)[:\s]*([^\n<.,;!?]+)/i,
        /(?:job title)[:\s]*([^\n<.,;!?]+)/i,
        /(?:software engineer|frontend developer|backend developer|full stack|data scientist|product manager|ux designer)/i
    ];
    
    for (const pattern of rolePatterns) {
        const match = body.match(pattern) || subject.match(pattern);
        if (match) {
            application.role = match[1] || match[0];
            break;
        }
    }
    
    // Determine status based on content analysis
    const statusPatterns = {
        'Interview': /interview|screening|phone screen|meeting|zoom|teams|call/i,
        'Assessment': /assessment|test|assignment|challenge|hackerrank|codility/i,
        'Offer': /offer|congratulations|welcome|compensation|package|joining/i,
        'Rejected': /reject|not moving|not selected|unfortunately|other candidate|decline/i
    };
    
    // Check subject and body for status indicators
    let currentStatus = 'Applied';
    for (const [status, pattern] of Object.entries(statusPatterns)) {
        if (pattern.test(subject) || pattern.test(body)) {
            currentStatus = status;
            // Don't break to allow "offer" to override "rejected" if both appear
            if (status === 'Offer') currentStatus = 'Offer';
        }
    }
    application.status = currentStatus;
    
    // Extract additional notes
    const notePatterns = [
        /next steps[:\s]*([^\n<.,;!?]+)/i,
        /deadline[:\s]*([^\n<.,;!?]+)/i,
        /salary[:\s]*([^\n<.,;!?]+)/i,
        /location[:\s]*([^\n<.,;!?]+)/i
    ];
    
    const notes = [];
    for (const pattern of notePatterns) {
        const match = body.match(pattern);
        if (match) {
            notes.push(match[0]);
        }
    }
    
    if (notes.length > 0) {
        application.notes = notes.join('; ');
    }
    
    return application;
}

// --- HELPER FUNCTIONS ---
function updateStats(applications) {
    statsContainer.style.display = 'flex';
    
    const total = applications.length;
    const interviews = applications.filter(app => app.status === 'Interview').length;
    const offers = applications.filter(app => app.status === 'Offer').length;
    const rejections = applications.filter(app => app.status === 'Rejected').length;
    
    statTotal.textContent = total;
    statInterviews.textContent = interviews;
    statOffers.textContent = offers;
    statRejections.textContent = rejections;
}

function renderTracker(applications) {
    if (applications.length === 0) {
        trackerContainer.innerHTML = '<p>No job applications found in your emails.</p>';
        return;
    }
    
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Company</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Notes</th>
                </tr>
            </thead>
            <tbody>
    `;

    applications.forEach(app => {
        const statusClass = `status-${app.status.toLowerCase()}`;
        tableHTML += `
            <tr>
                <td>${app.date}</td>
                <td>${app.company}</td>
                <td>${app.role}</td>
                <td><span class="status-badge ${statusClass}">${app.status}</span></td>
                <td>${app.notes}</td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table>';
    trackerContainer.innerHTML = tableHTML;
}