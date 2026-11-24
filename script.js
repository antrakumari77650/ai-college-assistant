
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

/* Theme preferences are device-local and never contain authentication data. */
(() => {
    const THEME_KEY = "aca_theme";
    const themeButton = document.getElementById("theme-toggle");
    const prefersDark = window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
    let theme = prefersDark ? "dark" : "light";

    try {
        const savedTheme = localStorage.getItem(THEME_KEY);
        if (savedTheme === "light" || savedTheme === "dark") {
            theme = savedTheme;
        }
    } catch (error) {
        console.warn("Unable to read the saved theme preference:", error);
    }

    function applyTheme(nextTheme, persist) {
        document.documentElement.dataset.theme = nextTheme;

        if (themeButton) {
            themeButton.setAttribute(
                "aria-label",
                nextTheme === "dark"
                    ? "Switch to light theme"
                    : "Switch to dark theme"
            );
            themeButton.setAttribute("aria-pressed", String(nextTheme === "dark"));
            themeButton.title = nextTheme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme";
        }

        if (persist) {
            try {
                localStorage.setItem(THEME_KEY, nextTheme);
            } catch (error) {
                console.warn("Unable to save the theme preference:", error);
            }
        }
    }

    applyTheme(theme, false);

    if (themeButton) {
        themeButton.addEventListener("click", () => {
            const nextTheme =
                document.documentElement.dataset.theme === "dark"
                    ? "light"
                    : "dark";
            applyTheme(nextTheme, true);
        });
    }
})();

/* Additive presentation, accessibility, and device-local productivity features. */
(() => {
    const SVG_NS = "http://www.w3.org/2000/svg";
    const recentKey = "aca_recent";
    const bookmarksKey = "aca_bookmarks";
    const storageWarnings = new Set();
    const toastRegion = document.createElement("div");
    toastRegion.className = "toast-region";
    toastRegion.setAttribute("role", "status");
    toastRegion.setAttribute("aria-live", "polite");
    toastRegion.setAttribute("aria-atomic", "false");
    document.body.appendChild(toastRegion);

    const iconPaths = {
        info: [["circle", { cx: "12", cy: "12", r: "9" }], ["path", { d: "M12 11v5m0-8h.01" }]],
        user: [["circle", { cx: "12", cy: "8", r: "4" }], ["path", { d: "M5 21a7 7 0 0 1 14 0" }]],
        success: [["path", { d: "m5 12 4 4L19 6" }]],
        error: [["path", { d: "M12 8v5m0 3h.01" }], ["circle", { cx: "12", cy: "12", r: "9" }]],
        close: [["path", { d: "m6 6 12 12M18 6 6 18" }]],
        file: [["path", { d: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" }], ["path", { d: "M14 3v6h6M8 14h8m-8 3h5" }]],
        star: [["path", { d: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" }]],
        empty: [["path", { d: "M5 8.5A2.5 2.5 0 0 1 7.5 6H18l3 3v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8.5Z" }], ["path", { d: "M14 6v4h7M8 14h8m-8 3h5" }]],
        search: [["circle", { cx: "10.8", cy: "10.8", r: "6.8" }], ["path", { d: "m16 16 4.5 4.5" }]],
        arrow: [["path", { d: "M5 12h14m-6-6 6 6-6 6" }]],
        open: [["path", { d: "M14 4h6v6m0-6-9 9" }], ["path", { d: "M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" }]]
    };

    function createIcon(name, className) {
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "1.8");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");
        if (className) svg.setAttribute("class", className);

        (iconPaths[name] || iconPaths.info).forEach(([tagName, attributes]) => {
            const shape = document.createElementNS(SVG_NS, tagName);
            Object.keys(attributes).forEach((attribute) => {
                shape.setAttribute(attribute, attributes[attribute]);
            });
            svg.appendChild(shape);
        });

        return svg;
    }

    function notify(message, kind) {
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.dataset.kind = kind || "info";

        const icon = document.createElement("span");
        icon.className = "toast-icon";
        icon.appendChild(createIcon(kind === "success" ? "success" : kind === "error" ? "error" : "info"));

        const text = document.createElement("span");
        text.className = "toast-message";
        text.textContent = String(message);

        const dismiss = document.createElement("button");
        dismiss.type = "button";
        dismiss.className = "toast-dismiss";
        dismiss.setAttribute("aria-label", "Dismiss notification");
        dismiss.appendChild(createIcon("close"));

        let removeTimer;
        function removeToast() {
            window.clearTimeout(removeTimer);
            if (!toast.isConnected) return;
            toast.classList.add("is-leaving");
            window.setTimeout(() => toast.remove(), 190);
        }

        dismiss.addEventListener("click", removeToast);
        toast.append(icon, text, dismiss);
        toastRegion.appendChild(toast);
        removeTimer = window.setTimeout(removeToast, 4000);
    }

    const alertTranslations = [
        ["PDF link nahi mila.", "Unable to get the secure PDF link. Please try again."],
        ["Login start nahi ho saka.", "Unable to start sign-in. Please check the secure connection and sign-in configuration."],
        ["Cognito login cancel ya fail hua.", "Sign-in was cancelled or failed. Please try again."],
        ["Login complete nahi hua.", "Sign-in could not be completed. Check the sign-in configuration and browser console."]
    ];

    window.alert = (message) => {
        const originalMessage = String(message);
        const translated = alertTranslations.find(([prefix]) => originalMessage.includes(prefix));
        notify(translated ? translated[1] : originalMessage, "error");
    };

    function reportStorageFailure(key, error, writing) {
        console.warn(
            writing
                ? `Unable to save ${key} in local storage:`
                : `Unable to read ${key} from local storage:`,
            error
        );
        if (!storageWarnings.has(key)) {
            storageWarnings.add(key);
            notify("Browser storage is unavailable. This device-local change may not be saved.", "error");
        }
    }

    function isDeviceRecord(value) {
        return Boolean(
            value &&
            typeof value === "object" &&
            typeof value.key === "string" &&
            value.key.length > 0 &&
            typeof value.displayName === "string" &&
            typeof value.subject === "string" &&
            typeof value.unit === "string"
        );
    }

    function readDeviceList(key) {
        try {
            const rawValue = localStorage.getItem(key);
            if (!rawValue) return [];
            const parsed = JSON.parse(rawValue);
            if (!Array.isArray(parsed)) {
                throw new TypeError(`The saved ${key} value is not a list.`);
            }
            return parsed.filter(isDeviceRecord);
        } catch (error) {
            reportStorageFailure(key, error, false);
            return [];
        }
    }

    function writeDeviceList(key, records) {
        try {
            localStorage.setItem(key, JSON.stringify(records));
            return true;
        } catch (error) {
            reportStorageFailure(key, error, true);
            return false;
        }
    }

    function makeRecord(note, subject, unit) {
        if (!note || note.key === undefined || note.key === null || String(note.key) === "") {
            return null;
        }
        const originalName = note.name === undefined || note.name === null
            ? String(note.key)
            : String(note.name);
        const displayName = originalName
            .replace(/\.pdf$/i, "")
            .replace(/[-_]+/g, " ")
            .replace(/\s+/g, " ")
            .trim() || "Untitled note";

        return {
            displayName,
            key: String(note.key),
            subject,
            unit,
            time: Date.now()
        };
    }

    function formatOpenedTime(value) {
        const timestamp = Number(value);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return "Opened recently";
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return "Opened recently";
        return `Opened ${date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric"
        })}`;
    }

    function renderCollection(target, records, emptyMessage, withTime) {
        target.replaceChildren();

        if (!records.length) {
            const empty = document.createElement("div");
            empty.className = "collection-empty";
            empty.appendChild(createIcon("file"));
            const text = document.createElement("span");
            text.textContent = emptyMessage;
            empty.appendChild(text);
            target.appendChild(empty);
            return;
        }

        records.forEach((record) => {
            const card = document.createElement("article");
            card.className = "collection-card";

            const fileIcon = document.createElement("span");
            fileIcon.className = "collection-pdf-icon";
            fileIcon.appendChild(createIcon("file"));

            const copy = document.createElement("span");
            copy.className = "collection-card-copy";
            const title = document.createElement("strong");
            title.textContent = record.displayName;
            const detail = document.createElement("span");
            detail.textContent = `${record.subject} · ${record.unit}${withTime ? ` · ${formatOpenedTime(record.time)}` : ""}`;
            copy.append(title, detail);

            const openButton = document.createElement("button");
            openButton.type = "button";
            openButton.className = "collection-open";
            openButton.setAttribute("aria-label", `Open ${record.displayName}`);
            openButton.title = `Open ${record.displayName}`;
            openButton.appendChild(createIcon("open"));
            openButton.addEventListener("click", () => {
                void openPdf(record, openButton);
            });

            card.append(fileIcon, copy, openButton);
            target.appendChild(card);
        });
    }

    const recentList = document.getElementById("recent-list");
    const bookmarksList = document.getElementById("bookmarks-list");

    function renderHomeCollections() {
        renderCollection(
            recentList,
            readDeviceList(recentKey).slice(0, 5),
            "PDFs you open will appear here.",
            true
        );
        renderCollection(
            bookmarksList,
            readDeviceList(bookmarksKey),
            "Notes you save will appear here.",
            false
        );
    }

    function saveRecent(record) {
        const currentRecords = readDeviceList(recentKey)
            .filter((item) => !(item.key === record.key && item.subject === record.subject));
        currentRecords.unshift(record);
        if (writeDeviceList(recentKey, currentRecords.slice(0, 5))) {
            renderHomeCollections();
        }
    }

    function isBookmarked(record) {
        return readDeviceList(bookmarksKey).some((item) =>
            item.key === record.key && item.subject === record.subject
        );
    }

    function toggleBookmark(record, button) {
        const records = readDeviceList(bookmarksKey);
        const existingIndex = records.findIndex((item) =>
            item.key === record.key && item.subject === record.subject
        );
        const isSaved = existingIndex !== -1;

        const updatedRecords = isSaved
            ? records.filter((item) => !(item.key === record.key && item.subject === record.subject))
            : [record, ...records];

        if (!writeDeviceList(bookmarksKey, updatedRecords)) return;

        const saved = !isSaved;
        button.setAttribute("aria-pressed", String(saved));
        button.setAttribute("aria-label", saved ? `Remove ${record.displayName} from saved notes` : `Save ${record.displayName} on this device`);
        button.title = saved ? "Saved on this device" : "Save on this device";
        button.replaceChildren(createIcon("star"));
        renderHomeCollections();
        notify(saved ? "Note saved on this device." : "Note removed from saved items.", "success");
    }

    function addText(parent, tagName, className, value) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        element.textContent = value;
        parent.appendChild(element);
        return element;
    }

    function appendMetaBadge(parent, value) {
        const badge = document.createElement("span");
        badge.className = "meta-badge";
        badge.textContent = value;
        parent.appendChild(badge);
    }

    function noteSize(note) {
        const rawSize = note.size ?? note.fileSize ?? note.file_size;
        if (rawSize === undefined || rawSize === null || rawSize === "") return "";
        const size = Number(rawSize);
        if (!Number.isFinite(size) || size < 0) return String(rawSize);
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    function noteDate(note) {
        const rawDate = note.lastModified ?? note.last_modified ?? note.modifiedAt ?? note.updatedAt;
        if (rawDate === undefined || rawDate === null || rawDate === "") return "";
        const date = new Date(rawDate);
        return Number.isNaN(date.getTime())
            ? String(rawDate)
            : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }

    function createPdfTile() {
        const tile = document.createElement("span");
        tile.className = "pdf-icon-tile";
        tile.appendChild(createIcon("file"));
        return tile;
    }

    function showLoadingSkeleton(container) {
        container.replaceChildren();
        const heading = document.createElement("div");
        heading.className = "resource-heading-row";
        const headingCopy = document.createElement("div");
        addText(headingCopy, "h3", "", "Available notes");
        addText(headingCopy, "p", "", "Loading notes for this unit...");
        heading.appendChild(headingCopy);
        container.appendChild(heading);

        const skeletonGrid = document.createElement("div");
        skeletonGrid.className = "skeleton-grid";
        for (let index = 0; index < 3; index += 1) {
            const skeleton = document.createElement("div");
            skeleton.className = "skeleton-card";
            const file = document.createElement("span");
            file.className = "skeleton-shape skeleton-icon";
            const lines = document.createElement("span");
            lines.className = "skeleton-lines";
            const firstLine = document.createElement("span");
            firstLine.className = "skeleton-shape skeleton-line";
            const secondLine = document.createElement("span");
            secondLine.className = "skeleton-shape skeleton-line";
            lines.append(firstLine, secondLine);
            skeleton.append(file, lines);
            skeletonGrid.appendChild(skeleton);
        }
        container.appendChild(skeletonGrid);
    }

    function renderEmptyState(container) {
        const empty = document.createElement("div");
        empty.className = "resource-empty";
        const illustration = document.createElementNS(SVG_NS, "svg");
        illustration.setAttribute("viewBox", "0 0 120 90");
        illustration.setAttribute("fill", "none");
        illustration.setAttribute("stroke", "currentColor");
        illustration.setAttribute("stroke-width", "2");
        illustration.setAttribute("stroke-linecap", "round");
        illustration.setAttribute("stroke-linejoin", "round");
        illustration.setAttribute("class", "empty-illustration");
        illustration.setAttribute("aria-hidden", "true");
        const page = document.createElementNS(SVG_NS, "path");
        page.setAttribute("d", "M36 16h33l18 18v37a7 7 0 0 1-7 7H36a7 7 0 0 1-7-7V23a7 7 0 0 1 7-7Z");
        const fold = document.createElementNS(SVG_NS, "path");
        fold.setAttribute("d", "M69 16v19h18M43 50h26m-26 11h20");
        illustration.append(page, fold);
        empty.insertBefore(illustration, empty.firstChild);
        addText(empty, "h4", "", "No notes uploaded for this unit yet");
        addText(empty, "p", "", "When notes are added for this subject and unit, they’ll appear here.");
        container.appendChild(empty);
    }

    function renderErrorState(container) {
        const errorCard = document.createElement("div");
        errorCard.className = "resource-error";
        const icon = document.createElement("span");
        icon.className = "toast-icon";
        icon.appendChild(createIcon("error"));
        errorCard.appendChild(icon);
        addText(errorCard, "h4", "", "Unable to load notes");
        addText(errorCard, "p", "", "Please check your connection and try loading the notes again.");
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "retry-button";
        retry.textContent = "Retry";
        retry.addEventListener("click", () => {
            cachedNotes = null;
            window.selectUnit(currentUnit);
        });
        errorCard.appendChild(retry);
        container.replaceChildren(errorCard);
    }

    function renderComingSoon(container, title, description) {
        const headingText = title || "Video Lectures";
        const descriptionText = description ||
            "Video lecture links are not connected yet. We’ll share an update when this section is ready.";
        const card = document.createElement("div");
        card.className = "coming-soon-card";
        const illustration = document.createElementNS(SVG_NS, "svg");
        illustration.setAttribute("viewBox", "0 0 120 90");
        illustration.setAttribute("fill", "none");
        illustration.setAttribute("stroke", "currentColor");
        illustration.setAttribute("stroke-width", "2");
        illustration.setAttribute("stroke-linecap", "round");
        illustration.setAttribute("stroke-linejoin", "round");
        illustration.setAttribute("class", "soon-illustration");
        illustration.setAttribute("aria-hidden", "true");
        const screen = document.createElementNS(SVG_NS, "rect");
        screen.setAttribute("x", "24");
        screen.setAttribute("y", "12");
        screen.setAttribute("width", "72");
        screen.setAttribute("height", "52");
        screen.setAttribute("rx", "10");
        const play = document.createElementNS(SVG_NS, "path");
        play.setAttribute("d", "m52 27 19 11-19 11V27Zm-18 46h52");
        illustration.append(screen, play);
        card.appendChild(illustration);
        const badge = addText(card, "span", "coming-badge", "Coming soon");
        badge.setAttribute("aria-label", `${headingText} coming soon`);
        addText(card, "h3", "", headingText);
        addText(card, "p", "", descriptionText);
        container.replaceChildren(card);
    }

    function renderNoteCard(container, note) {
        const noteUnit = note.unit === "all" ? "All Units" : `Unit ${currentUnit}`;
        const record = makeRecord(note, currentSubject, noteUnit);
        if (!record) return;
        if (note.publicUrl) record.publicUrl = note.publicUrl;

        const card = document.createElement("article");
        card.className = "resource-item";

        const copy = document.createElement("div");
        copy.className = "resource-copy";
        const title = addText(copy, "h3", "resource-title", record.displayName);

        const meta = document.createElement("p");
        meta.className = "resource-meta";
        appendMetaBadge(meta, currentSubject);
        appendMetaBadge(meta, noteUnit);
        copy.appendChild(meta);

        const optionalMeta = document.createElement("div");
        optionalMeta.className = "resource-extra-meta";
        const size = noteSize(note);
        const modified = noteDate(note);
        if (size) addText(optionalMeta, "span", "", size);
        if (modified) addText(optionalMeta, "span", "", `Updated ${modified}`);
        if (optionalMeta.childElementCount) copy.appendChild(optionalMeta);

        const actions = document.createElement("div");
        actions.className = "resource-card-actions";

        const bookmark = document.createElement("button");
        bookmark.type = "button";
        bookmark.className = "bookmark-button";
        const saved = isBookmarked(record);
        bookmark.setAttribute("aria-pressed", String(saved));
        bookmark.setAttribute("aria-label", saved ? `Remove ${record.displayName} from saved notes` : `Save ${record.displayName} on this device`);
        bookmark.title = saved ? "Saved on this device" : "Save on this device";
        bookmark.appendChild(createIcon("star"));
        bookmark.addEventListener("click", () => toggleBookmark(record, bookmark));

        const open = document.createElement("a");
        open.href = "#";
        open.className = "resource-link";
        open.setAttribute("aria-label", `Open PDF: ${record.displayName}`);
        open.appendChild(createIcon("open"));
        open.appendChild(document.createTextNode("Open PDF"));
        open.addEventListener("click", (event) => {
            event.preventDefault();
            if (open.getAttribute("aria-disabled") === "true") return;
            void openPdf(record, open);
        });

        actions.append(bookmark, open);
        card.append(createPdfTile(), copy, actions);
        container.appendChild(card);
        title.title = record.displayName;
    }

    const bundledNotes = [
        {
            name: "DS_U_1_P_1_+_P_2_ONE_SHOT_Notes_0e50b595_0984_4035_aadc_3fa33c336234.pdf",
            key: "notes/DS/unit1/DS_U_1_P_1_+_P_2_ONE_SHOT_Notes_0e50b595_0984_4035_aadc_3fa33c336234.pdf",
            subject: "DS",
            unit: "unit1",
            publicUrl: "notes/DS/unit1/DS_U_1_P_1_+_P_2_ONE_SHOT_Notes_0e50b595_0984_4035_aadc_3fa33c336234.pdf"
        },
        {
            name: "DS-U-2-Combined-Notes.pdf",
            key: "notes/DS/unit2/DS-U-2-Combined-Notes.pdf",
            subject: "DS",
            unit: "unit2",
            publicUrl: "notes/DS/unit2/DS-U-2-Combined-Notes.pdf"
        },
        {
            name: "DS U-3 ONE SHOT Notes_d6929866-44d9-4eb8-8de1-be2186ca57ba.pdf",
            key: "notes/DS/unit3/DS U-3 ONE SHOT Notes_d6929866-44d9-4eb8-8de1-be2186ca57ba.pdf",
            subject: "DS",
            unit: "unit3",
            publicUrl: "notes/DS/unit3/DS U-3 ONE SHOT Notes_d6929866-44d9-4eb8-8de1-be2186ca57ba.pdf"
        },
        {
            name: "DS U-4 ONE SHOT Notes_cfdfba56-1451-4965-80a7-f3e76b048945.pdf",
            key: "notes/DS/unit4/DS U-4 ONE SHOT Notes_cfdfba56-1451-4965-80a7-f3e76b048945.pdf",
            subject: "DS",
            unit: "unit4",
            publicUrl: "notes/DS/unit4/DS U-4 ONE SHOT Notes_cfdfba56-1451-4965-80a7-f3e76b048945.pdf"
        },
        {
            name: "DS_U_5_ONE_SHOT_Notes_Updated_e39dac1c_ee07_446e_9569_9d6639b6c90a.pdf",
            key: "notes/DS/unit5/DS_U_5_ONE_SHOT_Notes_Updated_e39dac1c_ee07_446e_9569_9d6639b6c90a.pdf",
            subject: "DS",
            unit: "unit5",
            publicUrl: "notes/DS/unit5/DS_U_5_ONE_SHOT_Notes_Updated_e39dac1c_ee07_446e_9569_9d6639b6c90a.pdf"
        },
        {
            name: "COA U-1 ONE SHOT NOTES_0034d0dc-b206-40e4-a10b-031dbf053943 (1).pdf",
            key: "notes/COA/unit1/COA U-1 ONE SHOT NOTES_0034d0dc-b206-40e4-a10b-031dbf053943 (1).pdf",
            subject: "Computer Organization and Architecture",
            unit: "unit1",
            publicUrl: "notes/COA/unit1/COA U-1 ONE SHOT NOTES_0034d0dc-b206-40e4-a10b-031dbf053943 (1).pdf"
        },
        {
            name: "COA U-2  ONE SHOT NOTES_3fa15631-4ddd-4861-a957-2ed1f5e6d05e.pdf",
            key: "notes/COA/unit2/COA U-2  ONE SHOT NOTES_3fa15631-4ddd-4861-a957-2ed1f5e6d05e.pdf",
            subject: "Computer Organization and Architecture",
            unit: "unit2",
            publicUrl: "notes/COA/unit2/COA U-2  ONE SHOT NOTES_3fa15631-4ddd-4861-a957-2ed1f5e6d05e.pdf"
        },
        {
            name: "COA U-3 ONE SHOT NOTES_4af1d3e7-8883-4cd7-a3e5-fad0de9000fb.pdf",
            key: "notes/COA/unit3/COA U-3 ONE SHOT NOTES_4af1d3e7-8883-4cd7-a3e5-fad0de9000fb.pdf",
            subject: "Computer Organization and Architecture",
            unit: "unit3",
            publicUrl: "notes/COA/unit3/COA U-3 ONE SHOT NOTES_4af1d3e7-8883-4cd7-a3e5-fad0de9000fb.pdf"
        },
        {
            name: "COA_U_4_ONE_SHOT_NOTES_6e9c9f83_6c3a_40ec_afdb_4d22f61f8368_1.pdf",
            key: "notes/COA/unit4/COA_U_4_ONE_SHOT_NOTES_6e9c9f83_6c3a_40ec_afdb_4d22f61f8368_1.pdf",
            subject: "Computer Organization and Architecture",
            unit: "unit4",
            publicUrl: "notes/COA/unit4/COA_U_4_ONE_SHOT_NOTES_6e9c9f83_6c3a_40ec_afdb_4d22f61f8368_1.pdf"
        },
        {
            name: "COA U-5 ONE SHOT NOTES_4ce790af-6f72-4e5b-8bcc-f3fc3571432c.pdf",
            key: "notes/COA/unit5/COA U-5 ONE SHOT NOTES_4ce790af-6f72-4e5b-8bcc-f3fc3571432c.pdf",
            subject: "Computer Organization and Architecture",
            unit: "unit5",
            publicUrl: "notes/COA/unit5/COA U-5 ONE SHOT NOTES_4ce790af-6f72-4e5b-8bcc-f3fc3571432c.pdf"
        },
        {
            name: "COA_Complete Notes.pdf",
            key: "notes/COA/complete/COA_Complete Notes.pdf",
            subject: "Computer Organization and Architecture",
            unit: "all",
            publicUrl: "notes/COA/complete/COA_Complete Notes.pdf"
        }
    ];

    function hasBundledNotes(unit) {
        const expectedSubject = normalize(expectedApiSubject());
        const expectedUnit = normalize(`unit${unit}`);
        return bundledNotes.some((note) =>
            normalize(note.subject) === expectedSubject &&
            (normalize(note.unit) === expectedUnit || note.unit === "all")
        );
    }

    function renderNotes(container, notes) {
        if (notes.some((note) => !note || typeof note !== "object" || Array.isArray(note))) {
            console.error("Notes API returned an invalid note entry.");
            renderErrorState(container);
            return;
        }
        const expectedSubject = normalize(expectedApiSubject());
        const expectedUnit = normalize(`unit${currentUnit}`);
        const matching = notes.filter((note) =>
            normalize(note.subject) === expectedSubject &&
            normalize(note.unit) === expectedUnit
        );
        const matchingNames = new Set(matching.map((note) =>
            normalize(note.name === undefined || note.name === null ? note.key : note.name)
        ));
        const bundledMatching = bundledNotes.filter((note) =>
            normalize(note.subject) === expectedSubject &&
            (normalize(note.unit) === expectedUnit || note.unit === "all") &&
            !matchingNames.has(normalize(note.name))
        );
        matching.push(...bundledMatching);
        if (matching.some((note) => note.key === undefined || note.key === null || String(note.key) === "")) {
            console.error("Notes API returned a matching note without a storage key.");
            renderErrorState(container);
            return;
        }

        container.replaceChildren();
        const heading = document.createElement("div");
        heading.className = "resource-heading-row";
        const headingCopy = document.createElement("div");
        addText(headingCopy, "h3", "", "Available notes");
        addText(headingCopy, "p", "", `${currentSubject} · Unit ${currentUnit}`);
        heading.appendChild(headingCopy);
        const count = addText(heading, "span", "resource-count", `0 of ${matching.length} files`);
        container.appendChild(heading);

        if (!matching.length) {
            renderEmptyState(container);
            return;
        }

        const toolbar = document.createElement("label");
        toolbar.className = "resource-toolbar";
        const searchIcon = createIcon("search");
        const search = document.createElement("input");
        search.type = "search";
        search.className = "resource-search";
        search.placeholder = "Search notes by name...";
        search.setAttribute("aria-label", "Search notes by name");
        toolbar.append(searchIcon, search);

        const list = document.createElement("div");
        list.className = "resource-list";
        list.setAttribute("aria-live", "polite");
        container.append(toolbar, list);

        function updateList() {
            const query = search.value.trim().toLocaleLowerCase();
            const filtered = matching.filter((note) => {
                const record = makeRecord(note, currentSubject, `Unit ${currentUnit}`);
                return record && record.displayName.toLocaleLowerCase().includes(query);
            });
            count.textContent = `${filtered.length} of ${matching.length} files`;
            list.replaceChildren();
            if (!filtered.length) {
                const noMatches = document.createElement("p");
                noMatches.className = "resource-empty-message";
                noMatches.textContent = "No notes match your search.";
                list.appendChild(noMatches);
                return;
            }
            filtered.forEach((note) => renderNoteCard(list, note));
        }

        search.addEventListener("input", updateList);
        updateList();
    }

    async function openPdf(record, trigger) {
        let pdfTab = null;
        let priorLabel = "";
        try {
            pdfTab = window.open("about:blank", "_blank");
            if (pdfTab) pdfTab.opener = null;

            if (trigger) {
                priorLabel = trigger.textContent;
                if (trigger instanceof HTMLButtonElement) {
                    trigger.disabled = true;
                } else {
                    trigger.setAttribute("aria-disabled", "true");
                    trigger.style.pointerEvents = "none";
                }
                trigger.replaceChildren();
                const spinner = document.createElement("span");
                spinner.className = "button-spinner";
                spinner.setAttribute("aria-hidden", "true");
                trigger.append(
                    spinner,
                    document.createTextNode(record.publicUrl ? "Opening PDF..." : "Getting PDF link...")
                );
                trigger.setAttribute("aria-live", "polite");
            }

            const pdfUrl = record.publicUrl
                ? new URL(record.publicUrl, document.baseURI).href
                : await getSignedPDFUrl(record.key);
            record.time = Date.now();
            saveRecent(record);

            if (pdfTab && !pdfTab.closed) {
                pdfTab.location.href = pdfUrl;
            } else {
                window.location.href = pdfUrl;
            }
        } catch (error) {
            if (pdfTab && !pdfTab.closed) pdfTab.close();
            console.error("PDF opening error:", error);
            notify("Unable to open this PDF. Please try again.", "error");
        } finally {
            if (trigger && trigger.isConnected) {
                if (trigger.classList.contains("resource-link")) {
                    trigger.removeAttribute("aria-disabled");
                    trigger.style.pointerEvents = "";
                    trigger.replaceChildren(createIcon("open"), document.createTextNode("Open PDF"));
                } else {
                    trigger.disabled = false;
                    trigger.replaceChildren(createIcon("open"));
                }
                trigger.removeAttribute("aria-live");
                if (priorLabel && !trigger.classList.contains("resource-link")) {
                    trigger.setAttribute("aria-label", priorLabel);
                }
            }
        }
    }

    function renderResourceView() {
        const container = document.getElementById("resource-content");
        if (!container) return;
        if (currentResource === "Lectures") {
            renderComingSoon(container);
            return;
        }
        if (!Array.isArray(cachedNotes) && !hasBundledNotes(currentUnit)) {
            renderErrorState(container);
            return;
        }
        renderNotes(container, Array.isArray(cachedNotes) ? cachedNotes : []);
    }

    let resourceRequestVersion = 0;
    const originalSelectUnit = window.selectUnit;
    function enhancedSelectUnit(unit) {
        const version = ++resourceRequestVersion;
        if (currentResource === "Notes" && hasBundledNotes(unit)) {
            currentUnit = unit;
            document.getElementById("selected-unit").textContent =
                `${currentSubject} - Unit ${unit} - ${currentResource}`;
            document.getElementById("resource-label").textContent =
                currentResource.toUpperCase();
            showPage("resource-section");
            afterPageChange("resource-section");
            renderResourceView();
            if (!Array.isArray(cachedNotes)) {
                getNotesList().then(() => {
                    if (version === resourceRequestVersion) renderResourceView();
                }).catch((error) => {
                    console.error("Online notes unavailable; showing bundled PDFs:", error);
                    if (version === resourceRequestVersion) {
                        notify("Online notes are unavailable; showing PDFs included with the project.", "info");
                    }
                });
            }
            return Promise.resolve();
        }
        const result = originalSelectUnit.call(window, unit);
        afterPageChange("resource-section");
        const resourceContainer = document.getElementById("resource-content");
        if (currentResource === "Notes" && resourceContainer) {
            showLoadingSkeleton(resourceContainer);
        }
        Promise.resolve(result).then(() => {
            if (version === resourceRequestVersion) renderResourceView();
        }).catch((error) => {
            console.error("Unable to render the selected study resource:", error);
            if (version === resourceRequestVersion) {
                notify("Unable to display this study resource. Please try again.", "error");
            }
        });
        return result;
    }
    window.selectUnit = enhancedSelectUnit;

    const unitContainer = document.getElementById("unit-buttons");
    function decorateUnitButtons() {
        if (!unitContainer) return;
        Array.from(unitContainer.querySelectorAll("button.unit-button")).forEach((button) => {
            const match = button.textContent.match(/\d+/);
            if (!match) return;
            const unit = Number(match[0]);
            button.dataset.unit = String(unit);
            button.setAttribute("aria-label", `Open Unit ${unit}`);
            button.replaceChildren();
            addText(button, "span", "unit-number", `Unit 0${unit}`);
            addText(button, "span", "unit-label", `Unit ${unit}`);
            const arrow = document.createElement("span");
            arrow.className = "unit-arrow";
            arrow.appendChild(createIcon("arrow"));
            button.appendChild(arrow);
        });
    }

    if (unitContainer) {
        unitContainer.addEventListener("click", (event) => {
            const target = event.target instanceof Element
                ? event.target.closest("button.unit-button")
                : null;
            if (!target) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const unit = Number(target.dataset.unit);
            if (unit >= 1 && unit <= 5) enhancedSelectUnit(unit);
        }, true);
    }

    function updateBreadcrumbs(sectionId) {
        const crumbTarget = document.getElementById(`breadcrumbs-${{
            "options-section": "options",
            "material-section": "material",
            "unit-section": "units",
            "resource-section": "resource",
            "pyq-section": "pyq"
        }[sectionId] || ""}`);
        if (!crumbTarget) return;
        crumbTarget.replaceChildren();

        const subjectName = currentSubject || "Subject";
        const crumbs = [{ label: "Home", action: () => window.goHome() }];
        if (sectionId === "options-section") {
            crumbs.push({ label: subjectName, current: true });
        } else if (sectionId === "material-section") {
            crumbs.push({ label: subjectName, action: () => window.backToOptions() });
            crumbs.push({ label: "Study Material", current: true });
        } else if (sectionId === "unit-section") {
            crumbs.push({ label: subjectName, action: () => window.backToOptions() });
            crumbs.push({ label: "Study Material", action: () => window.backToMaterial() });
            crumbs.push({ label: currentResource, current: true });
        } else if (sectionId === "resource-section") {
            crumbs.push({ label: subjectName, action: () => window.backToOptions() });
            crumbs.push({ label: "Study Material", action: () => window.backToMaterial() });
            crumbs.push({ label: currentResource, action: () => window.backToUnits() });
            crumbs.push({ label: `Unit ${currentUnit}`, current: true });
        } else if (sectionId === "pyq-section") {
            crumbs.push({ label: subjectName, action: () => window.backToOptions() });
            crumbs.push({ label: "Previous Year Questions", current: true });
        }

        crumbs.forEach((crumb) => {
            const item = document.createElement("li");
            if (crumb.current || !crumb.action) {
                const label = addText(item, "span", "breadcrumb-current", crumb.label);
                label.setAttribute("aria-current", "page");
            } else {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = crumb.label;
                button.addEventListener("click", crumb.action);
                item.appendChild(button);
            }
            crumbTarget.appendChild(item);
        });
    }

    function updateProgress(sectionId) {
        const idSuffix = {
            "options-section": "options",
            "material-section": "material",
            "unit-section": "units",
            "resource-section": "resource",
            "pyq-section": "pyq"
        }[sectionId];
        const target = idSuffix && document.getElementById(`progress-${idSuffix}`);
        if (!target) return;
        target.replaceChildren();

        const stepLabels = ["Subject", "Type", "Unit", "Document"];
        const activeStep = {
            "options-section": 1,
            "material-section": 2,
            "unit-section": 3,
            "resource-section": 4,
            "pyq-section": 2
        }[sectionId] || 1;

        stepLabels.forEach((label, index) => {
            const stepNumber = index + 1;
            const item = document.createElement("li");
            if (stepNumber < activeStep) item.classList.add("is-complete");
            if (stepNumber === activeStep) {
                item.classList.add("is-current");
                item.setAttribute("aria-current", "step");
            }
            const dot = addText(item, "span", "progress-dot", String(stepNumber));
            dot.setAttribute("aria-hidden", "true");
            addText(item, "span", "", label);
            target.appendChild(item);
        });
    }

    function afterPageChange(sectionId) {
        const section = document.getElementById(sectionId);
        if (!section || section.hidden) return;
        updateBreadcrumbs(sectionId);
        updateProgress(sectionId);
        section.classList.remove("page-enter");
        window.requestAnimationFrame(() => section.classList.add("page-enter"));
        window.requestAnimationFrame(() => {
            const heading = sectionId === "subjects"
                ? section.querySelector("h1")
                : section.querySelector(".section-heading h2");
            if (heading) heading.focus({ preventScroll: true });
        });
        if (sectionId === "unit-section") decorateUnitButtons();
        if (sectionId === "pyq-section") renderPYQMessage();
    }

    function wrapNavigation(name, sectionId) {
        const original = window[name];
        if (typeof original !== "function") return;
        window[name] = function (...args) {
            const result = original.apply(this, args);
            afterPageChange(sectionId);
            return result;
        };
    }

    wrapNavigation("selectSubject", "options-section");
    wrapNavigation("openStudyMaterial", "material-section");
    wrapNavigation("openPYQ", "pyq-section");
    wrapNavigation("openUnits", "unit-section");
    wrapNavigation("backToOptions", "options-section");
    wrapNavigation("backToMaterial", "material-section");
    wrapNavigation("backToUnits", "unit-section");
    wrapNavigation("goHome", "subjects");

    const pyqResult = document.getElementById("pyq-result");
    function renderPYQMessage() {
        if (!pyqResult) return;
        pyqResult.replaceChildren();
        const copy = document.createElement("div");
        copy.className = "pyq-result-copy";
        addText(copy, "strong", "", currentSubject || "Previous Year Questions");
        const year = document.getElementById("pyq-year");
        const type = document.getElementById("pyq-type");
        const yearText = year && year.selectedOptions.length
            ? year.selectedOptions[0].textContent
            : "";
        const typeText = type && type.value === "unit"
            ? "Unit-wise questions"
            : "Complete paper";
        addText(copy, "p", "", `${yearText}${yearText ? " · " : ""}${typeText}. PYQ files are not available yet.`);
        const badge = addText(pyqResult, "span", "files-soon-badge", "Files coming soon");
        badge.setAttribute("aria-label", "Previous year question files coming soon");
        pyqResult.insertBefore(copy, badge);
    }

    ["pyq-year", "pyq-type"].forEach((id) => {
        const select = document.getElementById(id);
        if (select) {
            select.addEventListener("change", () => {
                window.requestAnimationFrame(renderPYQMessage);
            });
        }
    });

    const status = document.getElementById("auth-status");
    function decorateAuthStatus() {
        if (!status) return;
        const signedIn = status.textContent.trim() === "Signed in";
        if (signedIn && !status.querySelector(".auth-avatar")) {
            status.classList.add("is-signed-in");
            status.replaceChildren();
            const avatar = document.createElement("span");
            avatar.className = "auth-avatar";
            avatar.appendChild(createIcon("user"));
            addText(status, "span", "auth-status-label", "Signed in");
            status.insertBefore(avatar, status.firstChild);
        } else if (!signedIn) {
            status.classList.remove("is-signed-in");
            if (status.querySelector(".auth-avatar")) {
                status.textContent = "Not signed in";
            }
        }
    }

    if (status) {
        const authObserver = new MutationObserver(decorateAuthStatus);
        authObserver.observe(status, { childList: true, characterData: true, subtree: true });
        decorateAuthStatus();
    }

    const recentClear = document.getElementById("clear-recent");
    if (recentClear) {
        recentClear.addEventListener("click", () => {
            if (writeDeviceList(recentKey, [])) {
                renderHomeCollections();
                notify("Recently opened items cleared from this device.", "info");
            }
        });
    }

    const bookmarksClear = document.getElementById("clear-bookmarks");
    if (bookmarksClear) {
        bookmarksClear.addEventListener("click", () => {
            if (writeDeviceList(bookmarksKey, [])) {
                renderHomeCollections();
                notify("Saved notes cleared from this device.", "info");
            }
        });
    }

    const commandDialog = document.getElementById("command-dialog");
    const commandInput = document.getElementById("command-input");
    const commandResults = document.getElementById("command-results");
    let activeCommandIndex = 0;

    function getVisibleCommands() {
        return Array.from(commandResults.querySelectorAll(".command-result"))
            .filter((button) => !button.hidden);
    }

    function updateCommandSelection() {
        const visibleCommands = getVisibleCommands();
        if (!visibleCommands.length) {
            activeCommandIndex = 0;
            return;
        }
        activeCommandIndex = (activeCommandIndex + visibleCommands.length) % visibleCommands.length;
        visibleCommands.forEach((button, index) => {
            button.setAttribute("aria-selected", String(index === activeCommandIndex));
        });
    }

    function chooseCommand(button) {
        if (!button) return;
        const subject = button.dataset.subject;
        if (!subject) return;
        commandDialog.close();
        window.selectSubject(subject);
    }

    function openCommandDialog() {
        if (!commandDialog) return;
        commandInput.value = "";
        Array.from(commandResults.querySelectorAll(".command-result")).forEach((button) => {
            button.hidden = false;
        });
        activeCommandIndex = 0;
        updateCommandSelection();
        if (typeof commandDialog.showModal === "function") {
            if (!commandDialog.open) commandDialog.showModal();
        } else {
            commandDialog.setAttribute("open", "");
        }
        window.requestAnimationFrame(() => commandInput.focus());
    }

    const commandOpenButton = document.querySelector(".command-open");
    if (commandOpenButton) commandOpenButton.addEventListener("click", openCommandDialog);

    if (commandInput && commandResults) {
        commandInput.addEventListener("input", () => {
            const query = commandInput.value.trim().toLocaleLowerCase();
            Array.from(commandResults.querySelectorAll(".command-result")).forEach((button) => {
                button.hidden = !button.textContent.toLocaleLowerCase().includes(query);
            });
            activeCommandIndex = 0;
            updateCommandSelection();
        });
        commandInput.addEventListener("keydown", (event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                activeCommandIndex += event.key === "ArrowDown" ? 1 : -1;
                updateCommandSelection();
            } else if (event.key === "Enter") {
                event.preventDefault();
                chooseCommand(getVisibleCommands()[activeCommandIndex]);
            } else if (event.key === "Escape") {
                event.preventDefault();
                commandDialog.close();
            }
        });
        commandResults.addEventListener("click", (event) => {
            const button = event.target instanceof Element
                ? event.target.closest(".command-result")
                : null;
            if (button) chooseCommand(button);
        });
    }

    document.addEventListener("keydown", (event) => {
        const target = event.target;
        const isEditing = target instanceof Element &&
            (target.matches("input, textarea, select") || target.isContentEditable);
        if (event.key === "Escape" && commandDialog && commandDialog.open) {
            event.preventDefault();
            commandDialog.close();
            return;
        }
        if (isEditing || (event.altKey && event.key === "/")) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            openCommandDialog();
        } else if (event.key === "/") {
            event.preventDefault();
            openCommandDialog();
        }
    });

    const header = document.querySelector(".header");
    let scrollUpdateScheduled = false;
    window.addEventListener("scroll", () => {
        if (scrollUpdateScheduled) return;
        scrollUpdateScheduled = true;
        window.requestAnimationFrame(() => {
            if (header) header.classList.toggle("is-scrolled", window.scrollY > 8);
            scrollUpdateScheduled = false;
        });
    }, { passive: true });

    const revealElements = document.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window) {
        document.documentElement.classList.add("js-reveal-ready");
        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });
        revealElements.forEach((element) => revealObserver.observe(element));
    } else {
        revealElements.forEach((element) => element.classList.add("is-visible"));
    }

    const finePointer = window.matchMedia &&
        window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (finePointer) {
        document.querySelectorAll(".subject-card").forEach((card) => {
            let frameScheduled = false;
            let pointerEvent;
            card.addEventListener("pointermove", (event) => {
                pointerEvent = event;
                if (frameScheduled) return;
                frameScheduled = true;
                window.requestAnimationFrame(() => {
                    const rect = card.getBoundingClientRect();
                    const x = pointerEvent.clientX - rect.left;
                    const y = pointerEvent.clientY - rect.top;
                    const percentX = (x / rect.width) * 100;
                    const percentY = (y / rect.height) * 100;
                    const rotateY = ((percentX - 50) / 50) * 2.2;
                    const rotateX = ((50 - percentY) / 50) * 2.2;
                    card.style.setProperty("--mx", `${percentX}%`);
                    card.style.setProperty("--my", `${percentY}%`);
                    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
                    frameScheduled = false;
                });
            }, { passive: true });
            card.addEventListener("pointerleave", () => {
                card.style.removeProperty("--mx");
                card.style.removeProperty("--my");
                card.style.removeProperty("transform");
            }, { passive: true });
        });
    }

    window.addEventListener("storage", (event) => {
        if (event.key === recentKey || event.key === bookmarksKey) {
            renderHomeCollections();
        }
    });

    renderHomeCollections();
    renderPYQMessage();
    window.requestAnimationFrame(() => {
        const heading = document.querySelector("#subjects h1");
        if (heading && !document.querySelector(".page-view:not([hidden])")) {
            heading.setAttribute("tabindex", "-1");
        }
    });
})();
