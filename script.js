
const API_BASE_URL =
    "https://iglv60wmjf.execute-api.ap-south-1.amazonaws.com";

let currentSubject = "";
let currentUnit = 1;
let currentResource = "Notes";
let cachedNotes = null;

const pageIds = [
    "subjects",
    "options-section",
    "material-section",
    "unit-section",
    "resource-section",
    "pyq-section"
];

function showPage(pageId) {
    pageIds.forEach((id) => {
        const page = document.getElementById(id);
        if (page) page.hidden = id !== pageId;
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function normalize(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function expectedApiSubject() {
    if (currentSubject === "Data Structures") return "DS";
    if (currentSubject === "Maths-4") return "Maths 4";

    return currentSubject;
}

function selectSubject(subject) {
    currentSubject = subject;

    document.getElementById("selected-subject").textContent =
        subject;

    document.getElementById("pyq-heading").textContent =
        subject + " - Previous Year Questions";

    showPage("options-section");
}

function openStudyMaterial() {
    document.getElementById("material-heading").textContent =
        currentSubject + " - Study Material";

    showPage("material-section");
}

function openPYQ() {
    document.getElementById("pyq-heading").textContent =
        currentSubject + " - Previous Year Questions";

    updatePYQMessage();
    showPage("pyq-section");
}

function openUnits(type) {
    currentResource = type;

    document.getElementById("unit-resource-label").textContent =
        type.toUpperCase();

    document.getElementById("selected-unit-heading").textContent =
        currentSubject + " - " + type;

    document.getElementById("unit-buttons").replaceChildren();

    for (let unit = 1; unit <= 5; unit++) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "unit-button";
        button.textContent = "Unit " + unit;
        button.addEventListener("click", () => selectUnit(unit));

        document.getElementById("unit-buttons").appendChild(button);
    }

    showPage("unit-section");
}

async function selectUnit(unit) {
    currentUnit = unit;

    document.getElementById("selected-unit").textContent =
        `${currentSubject} - Unit ${unit} - ${currentResource}`;

    document.getElementById("resource-label").textContent =
        currentResource.toUpperCase();

    showPage("resource-section");
    await showResources();
}

async function getNotesList() {
    if (cachedNotes) return cachedNotes;

    const response = await fetch(API_BASE_URL + "/");
    let data = await response.json();

    if (data && typeof data.body === "string") {
        try {
            data = JSON.parse(data.body);
        } catch {
            // Keep the original response if body is not JSON.
        }
    }

    if (!response.ok || !data.ok || !Array.isArray(data.notes)) {
        throw new Error("AWS API notes list response was not valid.");
    }

    cachedNotes = data.notes;
    return cachedNotes;
}
async function getSignedPDFUrl(noteKey) {
    const url = new URL(API_BASE_URL + "/");
    url.searchParams.set("action", "url");
    url.searchParams.set("key", noteKey);
    const response = await fetch(url.toString());
    let data = await response.json();

    if (data && typeof data.body === "string") {
        try {
            data = JSON.parse(data.body);
        } catch {
            // Keep the original response if body is not JSON.
        }
    }

    if (!response.ok || !data.ok || !data.url) {
        throw new Error(
            "AWS API did not return a PDF URL. The notes-list API works, " +
            "but the Lambda PDF-link response needs to be checked."
        );
    }

    return data.url;
}

function addMessage(container, message) {
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    container.appendChild(paragraph);
}

async function showResources() {
    const container = document.getElementById("resource-content");
    container.replaceChildren();

    if (currentResource === "Lectures") {
        const heading = document.createElement("h3");
        heading.textContent = "Video Lectures";
        container.appendChild(heading);

        addMessage(
            container,
            "Video lecture links have not been connected yet. " +
            "The unit-wise lecture section is ready."
        );
        return;
    }

    const heading = document.createElement("h3");
    heading.textContent = "Available Notes";
    container.appendChild(heading);

    addMessage(container, "Loading notes from AWS...");

    try {
        const notes = await getNotesList();

        const subjectToMatch = normalize(expectedApiSubject());
        const unitToMatch = normalize("unit" + currentUnit);

        const matchingNotes = notes.filter((note) => {
            return (
                normalize(note.subject) === subjectToMatch &&
                normalize(note.unit) === unitToMatch
            );
        });

        container.replaceChildren();
        container.appendChild(heading);

        if (matchingNotes.length === 0) {
            addMessage(
                container,
                "No PDF notes are uploaded for this subject and unit yet."
            );
            return;
        }

        addMessage(container, matchingNotes.length + " PDF file(s) found.");

        matchingNotes.forEach((note) => {
            const card = document.createElement("div");
            card.className = "resource-item";

            const name = document.createElement("h3");
            name.className = "resource-title";
            name.textContent = note.name;

            const details = document.createElement("p");
            details.className = "resource-meta";
            details.textContent =
                `${note.subject} • ${note.unit}`;

            const link = document.createElement("a");
            link.className = "resource-link";
            link.href = "#";
            link.textContent = "Open PDF ↗";

            link.addEventListener("click", async (event) => {
                event.preventDefault();

                // Open a tab immediately so the browser is less likely
                // to block it while the signed URL is being requested.
                const pdfTab = window.open("about:blank", "_blank");

                link.textContent = "Getting PDF link...";
                link.style.pointerEvents = "none";

                try {
                    const signedUrl = await getSignedPDFUrl(note.key);

                    if (pdfTab && !pdfTab.closed) {
                        pdfTab.location.href = signedUrl;
                    } else {
                        window.location.href = signedUrl;
                    }
                } catch (error) {
                    if (pdfTab && !pdfTab.closed) pdfTab.close();

                    console.error("PDF opening error:", error);

                    alert(
                        "PDF link nahi mila. Notes listing API chal rahi hai, " +
                        "lekin Lambda ka signed-URL response check karna hoga."
                    );
                } finally {
                    link.textContent = "Open PDF ↗";
                    link.style.pointerEvents = "";
                }
            });

            card.appendChild(name);
            card.appendChild(details);
            card.appendChild(link);
            container.appendChild(card);
        });
    } catch (error) {
        console.error("Notes loading error:", error);
        container.replaceChildren();

        const heading = document.createElement("h3");
        heading.textContent = "Unable to Load Notes";
        container.appendChild(heading);

        addMessage(
            container,
            "AWS se notes load nahi ho paye. Internet, CORS settings " +
            "aur API response check karo."
        );
    }
}

function backToOptions() {
    showPage("options-section");
}

function backToMaterial() {
    showPage("material-section");
}

function backToUnits() {
    showPage("unit-section");
}

function goHome() {
    showPage("subjects");
}

function updatePYQMessage() {
    const year = document.getElementById("pyq-year").value;
    const type = document.getElementById("pyq-type").value;
    const result = document.getElementById("pyq-result");

    result.textContent =
        `${currentSubject} • ${year} • ` +
        (type === "all" ? "Complete Paper" : "Unit-wise Questions") +
        ". PYQ files have not been connected yet.";
}

document.addEventListener("DOMContentLoaded", () => {
    const year = document.getElementById("pyq-year");
    const type = document.getElementById("pyq-type");

    if (year) year.addEventListener("change", updatePYQMessage);
    if (type) type.addEventListener("change", updatePYQMessage);
});

// Make functions available to the onclick handlers in index.html.
window.selectSubject = selectSubject;
window.openStudyMaterial = openStudyMaterial;
window.openPYQ = openPYQ;
window.openUnits = openUnits;
window.selectUnit = selectUnit;
window.backToOptions = backToOptions;
window.backToMaterial = backToMaterial;
window.backToUnits = backToUnits;
window.goHome = goHome;

/* =====================================================
   COGNITO LOGIN + JWT AUTHENTICATION
   Existing notes/PDF functions are preserved.
   ===================================================== */

(() => {
    const COGNITO_DOMAIN =
        "https://ap-south-1cc1u6ilxb.auth.ap-south-1.amazoncognito.com";

    const COGNITO_CLIENT_ID =
        "17humrejevac0hav084j84t16k";

    const COGNITO_REDIRECT_URI =
        "https://gauravsinghcoderr.github.io/ai-college-assistant/";

    const COGNITO_LOGOUT_URI =
        "https://gauravsinghcoderr.github.io/ai-college-assistant/";

    const TOKEN_KEY = "aca_cognito_access_token";
    const EXPIRY_KEY = "aca_cognito_access_expiry";
    const STATE_KEY = "aca_cognito_oauth_state";
    const VERIFIER_KEY = "aca_cognito_pkce_verifier";

    // Get the current valid access token.
    function getAccessToken() {
        const token = sessionStorage.getItem(TOKEN_KEY);
        const expiry = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);

        if (!token || Date.now() >= expiry) {
            sessionStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(EXPIRY_KEY);
            return null;
        }

        return token;
    }

    // Update Login/Logout buttons in index.html.
    function updateAuthUI() {
        const signedIn = Boolean(getAccessToken());

        const loginButton = document.getElementById("login-btn");
        const logoutButton = document.getElementById("logout-btn");
        const status = document.getElementById("auth-status");

        if (loginButton) {
            loginButton.hidden = signedIn;
            loginButton.style.display = signedIn ? "none" : "";
        }

        if (logoutButton) {
            logoutButton.hidden = !signedIn;
            logoutButton.style.display = signedIn ? "" : "none";
        }

        if (status) {
            status.textContent = signedIn
                ? "Signed in"
                : "Not signed in";
        }
    }

    // Generate a cryptographically random string for OAuth PKCE.
    function randomString(length = 64) {
        const bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);

        return Array.from(bytes, byte =>
            String.fromCharCode(bytes[0] * 0 + byte)
        ).join("");
    }

    function base64UrlEncode(bytes) {
        let binary = "";

        bytes.forEach(byte => {
            binary += String.fromCharCode(byte);
        });

        return btoa(binary)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }

    async function createCodeChallenge(verifier) {
        const data = new TextEncoder().encode(verifier);
        const digest = await crypto.subtle.digest("SHA-256", data);

        return base64UrlEncode(new Uint8Array(digest));
    }

    // Start Cognito Hosted UI login / account creation.
    async function signIn() {
        try {
            if (!window.crypto?.subtle) {
                throw new Error("Secure login requires HTTPS.");
            }

            const verifier = base64UrlEncode(
                crypto.getRandomValues(new Uint8Array(32))
            );

            const state = base64UrlEncode(
                crypto.getRandomValues(new Uint8Array(24))
            );

            const challenge = await createCodeChallenge(verifier);

            sessionStorage.setItem(VERIFIER_KEY, verifier);
            sessionStorage.setItem(STATE_KEY, state);

            const authorizeURL = new URL(
                `${COGNITO_DOMAIN}/oauth2/authorize`
            );

            authorizeURL.search = new URLSearchParams({
                client_id: COGNITO_CLIENT_ID,
                response_type: "code",
                scope: "openid email",
                redirect_uri: COGNITO_REDIRECT_URI,
                state: state,
                code_challenge_method: "S256",
                code_challenge: challenge
            }).toString();

            window.location.assign(authorizeURL.toString());
        } catch (error) {
            console.error("Unable to start Cognito login:", error);
            alert("Login start nahi ho saka. HTTPS aur Cognito settings check karo.");
        }
    }

    // Sign out from this app and Cognito Hosted UI.
    function signOut() {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(EXPIRY_KEY);
        sessionStorage.removeItem(STATE_KEY);
        sessionStorage.removeItem(VERIFIER_KEY);

        updateAuthUI();

        const logoutURL = new URL(`${COGNITO_DOMAIN}/logout`);

        logoutURL.search = new URLSearchParams({
            client_id: COGNITO_CLIENT_ID,
            logout_uri: COGNITO_LOGOUT_URI
        }).toString();

        window.location.assign(logoutURL.toString());
    }

    // Make inline HTML onclick handlers able to call these functions.
    window.signIn = signIn;
    window.signOut = signOut;

    /*
     * Automatically attach the Cognito access token to requests
     * sent to our existing AWS API. Requests to other URLs,
     * including presigned S3 PDF URLs, are left unchanged.
     */
    const originalFetch = window.fetch.bind(window);

    window.fetch = function (input, init = {}) {
        const requestURL =
            typeof input === "string" || input instanceof URL
                ? String(input)
                : input.url;

        if (
            typeof API_BASE_URL === "undefined" ||
            !requestURL.startsWith(API_BASE_URL)
        ) {
            return originalFetch(input, init);
        }

        const headers = new Headers(
            input instanceof Request ? input.headers : undefined
        );

        if (init.headers) {
            new Headers(init.headers).forEach((value, key) => {
                headers.set(key, value);
            });
        }

        const token = getAccessToken();

        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }

        return originalFetch(input, {
            ...init,
            headers
        });
    };

    // Exchange the one-time authorization code for tokens.
    async function finishLoginIfNeeded() {
        const currentURL = new URL(window.location.href);
        const code = currentURL.searchParams.get("code");
        const returnedState = currentURL.searchParams.get("state");
        const oauthError = currentURL.searchParams.get("error");

        if (oauthError) {
            currentURL.searchParams.delete("code");
            currentURL.searchParams.delete("state");
            currentURL.searchParams.delete("error");
            currentURL.searchParams.delete("error_description");

            history.replaceState(
                {},
                document.title,
                currentURL.pathname + currentURL.search + currentURL.hash
            );

            sessionStorage.removeItem(STATE_KEY);
            sessionStorage.removeItem(VERIFIER_KEY);

            updateAuthUI();
            alert("Cognito login cancel ya fail hua. Dobara try karo.");
            return;
        }

        if (!code) {
            updateAuthUI();
            return;
        }

        const expectedState = sessionStorage.getItem(STATE_KEY);
        const verifier = sessionStorage.getItem(VERIFIER_KEY);

        if (!expectedState || returnedState !== expectedState || !verifier) {
            sessionStorage.removeItem(STATE_KEY);
            sessionStorage.removeItem(VERIFIER_KEY);

            history.replaceState(
                {},
                document.title,
                currentURL.pathname
            );

            updateAuthUI();
            alert("Login verification failed. Please sign in again.");
            return;
        }

        try {
            const response = await originalFetch(
                `${COGNITO_DOMAIN}/oauth2/token`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded"
                    },
                    body: new URLSearchParams({
                        grant_type: "authorization_code",
                        client_id: COGNITO_CLIENT_ID,
                        code: code,
                        redirect_uri: COGNITO_REDIRECT_URI,
                        code_verifier: verifier
                    })
                }
            );

            const result = await response.json();

            if (!response.ok || !result.access_token) {
                throw new Error(
                    result.error_description ||
                    result.error ||
                    "Token exchange failed"
                );
            }

            sessionStorage.setItem(TOKEN_KEY, result.access_token);

            sessionStorage.setItem(
                EXPIRY_KEY,
                String(
                    Date.now() +
                    Math.max(60, (result.expires_in || 3600) - 60) * 1000
                )
            );

            sessionStorage.removeItem(STATE_KEY);
            sessionStorage.removeItem(VERIFIER_KEY);

            // Remove the one-time code from the address bar and
            // reload the page so existing app code runs with the token.
            window.location.replace(COGNITO_REDIRECT_URI);
        } catch (error) {
            console.error("Cognito token exchange failed:", error);

            sessionStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(EXPIRY_KEY);
            sessionStorage.removeItem(STATE_KEY);
            sessionStorage.removeItem(VERIFIER_KEY);

            currentURL.searchParams.delete("code");
            currentURL.searchParams.delete("state");

            history.replaceState(
                {},
                document.title,
                currentURL.pathname + currentURL.search + currentURL.hash
            );

            updateAuthUI();
            alert(
                "Login complete nahi hua. Cognito callback URL, App Client " +
                "settings aur browser Console mein error check karna hoga."
            );
        }
    }

    updateAuthUI();
    finishLoginIfNeeded();
})();
