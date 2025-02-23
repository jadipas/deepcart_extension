// --- Initial Setup ---
console.log("Content script loaded.");
const pageEnterTime = Date.now();
const domain = window.location.hostname;

// Hardcoded categorization for common websites
const categoryMap = {
    "amazon.com": "Electronics",
    "ebay.com": "Electronics",
    "walmart.com": "Retail",
    "goodreads.com": "Books",
    "nytimes.com": "News",
    "facebook.com": "Social",
    "youtube.com": "Entertainment",
    "netflix.com": "Entertainment",
};

// Hardcoded vocabulary for tokens (for categories and actions)
const vocabulary = {
    Electronics: 1,
    Retail: 2,
    Books: 3,
    News: 4,
    Social: 5,
    Entertainment: 6,
    SearchResults: 7,
    ProductPage: 8,
    Cart: 9,
    Other: 0,
    AddToCart: 101,
    ViewDetails: 102,
    Reviews: 103,
    DefaultClick: 200,
};

// --- Configuration ---
const BATCH_INTERVAL = 2000; // 2 seconds
const MAX_TIME_SPENT = 600; // 10 minutes (for normalization)
const QUERY_DEBOUNCE = 500; // 500ms

// --- Session Initialization ---
const sessionId = Date.now() + "-" + Math.random().toString(36).substr(2, 9);
let lastActionTime = Date.now();
const eventBuffer = [];

// --- Device Detection ---
// Requires UAParser library to be loaded on the page
const parser = new UAParser();
const deviceType = parser.getDevice().type || "desktop";
const os = parser.getOS().name || "unknown";

// --- Enhanced Category Mapping ---
const getEnhancedCategory = (domain, path) => {
    const pathSegments = path.split("/").filter(Boolean);

    if (domain.includes("amazon")) {
        if (path.includes("/dp/")) return "ProductPage";
        if (pathSegments[0] === "cart") return "Cart";
        if (path.includes("/s?")) return "SearchResults";
    }
    // Match if the domain contains any key in categoryMap
    for (const key in categoryMap) {
        if (domain.includes(key)) return categoryMap[key];
    }
    return "Other";
};

// --- Action Inference Engine ---
const inferAction = (element) => {
    const commonSelectors = {
        AddToCart: [
            '[data-testid="add-to-cart"]',
            '[id*="addToCart"]',
            ".add-to-cart",
        ],
        ViewDetails: ['[href*="/product/"]', '[id*="productDetails"]'],
        Reviews: ["#reviews", '[data-section="reviews"]'],
    };

    for (const [action, selectors] of Object.entries(commonSelectors)) {
        if (selectors.some((sel) => element.matches(sel))) return action;
    }

    // Text content heuristic
    const text = element.innerText?.toLowerCase();
    if (text?.includes("add to cart")) return "AddToCart";
    if (text?.includes("view details")) return "ViewDetails";

    return "DefaultClick";
};

// --- Enhanced Scroll Tracking ---
let maxScrollDepth = 0;
const scrollObserver = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const currentDepth =
                    entry.boundingClientRect.top / window.innerHeight;
                maxScrollDepth = Math.max(maxScrollDepth, currentDepth);
            }
        });
    },
    { threshold: Array.from({ length: 10 }, (_, i) => i * 0.1) }
);

// Observe bottom 25% of page
const scrollAnchor = document.createElement("div");
scrollAnchor.style.position = "absolute";
scrollAnchor.style.bottom = "25%";
document.body.appendChild(scrollAnchor);
scrollObserver.observe(scrollAnchor);

// --- Search Query Handling with Debouncing ---
let searchTimeout;
document
    .querySelectorAll('input[type="search"], input[type="text"]')
    .forEach((input) => {
        input.addEventListener("input", (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                if (e.target.value.length >= 3) {
                    const query = e.target.value.trim();
                    recordEvent({
                        type: "searchQuery",
                        query: query,
                        normalizedLength: Math.min(query.length / 100, 1), // Normalize: max 100 chars
                    });
                }
            }, QUERY_DEBOUNCE);
        });
    });

// --- Event Recording System ---
function recordEvent(event) {
    const now = Date.now();
    const timeSinceLast = (now - lastActionTime) / 1000; // in seconds

    const baseEvent = {
        sessionId,
        deviceType,
        os,
        timestamp: now,
        timeSinceLast: Math.min(timeSinceLast / 60, 1), // Normalized: 1 minute max
        url: window.location.href,
    };

    const fullEvent = { ...baseEvent, ...event };
    // console.log("Recording event:", fullEvent); // Print each event as it occurs
    eventBuffer.push(fullEvent);
    lastActionTime = now;
}

// --- Batch Processing ---
setInterval(() => {
    if (eventBuffer.length > 0) {
        browser.runtime.sendMessage({
            type: "batchEvent",
            events: eventBuffer.splice(0, eventBuffer.length),
        });
    }
}, BATCH_INTERVAL);

// --- Page Exit Handler ---
window.addEventListener("beforeunload", () => {
    const timeSpent = (Date.now() - pageEnterTime) / 1000;

    recordEvent({
        type: "pageExit",
        timeSpent: Math.min(timeSpent / MAX_TIME_SPENT, 1), // Normalized time spent
        scrollDepth: maxScrollDepth,
        finalPage: true,
    });

    // Force send remaining events
    if (eventBuffer.length > 0) {
        browser.runtime.sendMessage({
            type: "batchEvent",
            events: eventBuffer.splice(0, eventBuffer.length),
        });
    }
});

// --- Click Handling ---
document.addEventListener("click", (e) => {
    const action = inferAction(e.target);
    recordEvent({
        type: "clickEvent",
        action: action,
        elementType: e.target.tagName,
        coordinates: {
            x: e.clientX / window.innerWidth, // Normalized X coordinate
            y: e.clientY / window.innerHeight, // Normalized Y coordinate
        },
    });
});

// --- Initial Page View ---
const path = window.location.pathname;
const enhancedCategory = getEnhancedCategory(domain, path);
recordEvent({
    type: "pageView",
    category: enhancedCategory,
    token:
        vocabulary[enhancedCategory] !== undefined
            ? vocabulary[enhancedCategory]
            : vocabulary.Other,
});
