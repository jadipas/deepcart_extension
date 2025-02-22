// Constants and configurations
const CONFIG = {
    BATCH_INTERVAL: 2000, // 2 seconds
    MAX_TIME_SPENT: 600, // 10 minutes
    QUERY_DEBOUNCE: 500, // 500ms
    SCROLL_THRESHOLDS: Array.from({ length: 10 }, (_, i) => i * 0.1),
};

// Category and action vocabularies
const CATEGORIES = {
    ELECTRONICS: 1,
    RETAIL: 2,
    BOOKS: 3,
    NEWS: 4,
    SOCIAL: 5,
    ENTERTAINMENT: 6,
    SEARCH_RESULTS: 7,
    PRODUCT_PAGE: 8,
    CART: 9,
    OTHER: 0,
};

const ACTIONS = {
    ADD_TO_CART: 101,
    VIEW_DETAILS: 102,
    REVIEWS: 103,
    DEFAULT_CLICK: 200,
};

// Domain category mapping
const DOMAIN_CATEGORIES = new Map([
    ["amazon.com", CATEGORIES.ELECTRONICS],
    ["ebay.com", CATEGORIES.ELECTRONICS],
    ["walmart.com", CATEGORIES.RETAIL],
    ["goodreads.com", CATEGORIES.BOOKS],
    ["nytimes.com", CATEGORIES.NEWS],
    ["facebook.com", CATEGORIES.SOCIAL],
    ["youtube.com", CATEGORIES.ENTERTAINMENT],
    ["netflix.com", CATEGORIES.ENTERTAINMENT],
]);

class WebAnalytics {
    constructor() {
        this.sessionId = `${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;
        this.lastActionTime = Date.now();
        this.pageEnterTime = Date.now();
        this.eventBuffer = [];
        this.maxScrollDepth = 0;
        this.parser = new UAParser();

        this.deviceInfo = {
            type: this.parser.getDevice().type || "desktop",
            os: this.parser.getOS().name || "unknown",
        };

        this.initializeTracking();
    }

    initializeTracking() {
        this.setupScrollTracking();
        this.setupSearchTracking();
        this.setupClickTracking();
        this.setupPageExitTracking();
        this.startBatchProcessing();
        this.recordInitialPageView();
    }

    setupScrollTracking() {
        const scrollAnchor = document.createElement("div");
        scrollAnchor.style.cssText =
            "position: absolute; bottom: 25%; width: 100%;";
        document.body.appendChild(scrollAnchor);

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const currentDepth =
                            entry.boundingClientRect.top / window.innerHeight;
                        this.maxScrollDepth = Math.max(
                            this.maxScrollDepth,
                            currentDepth
                        );
                    }
                });
            },
            { threshold: CONFIG.SCROLL_THRESHOLDS }
        );

        observer.observe(scrollAnchor);
    }

    setupSearchTracking() {
        let searchTimeout;
        const searchInputs = document.querySelectorAll(
            'input[type="search"], input[type="text"]'
        );

        searchInputs.forEach((input) => {
            input.addEventListener("input", (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    const query = e.target.value.trim();
                    if (query.length >= 3) {
                        this.recordEvent({
                            type: "searchQuery",
                            query,
                            normalizedLength: Math.min(query.length / 100, 1),
                        });
                    }
                }, CONFIG.QUERY_DEBOUNCE);
            });
        });
    }

    setupClickTracking() {
        document.addEventListener("click", (e) => {
            const action = this.inferAction(e.target);
            this.recordEvent({
                type: "clickEvent",
                action,
                elementType: e.target.tagName,
                coordinates: {
                    x: e.clientX / window.innerWidth,
                    y: e.clientY / window.innerHeight,
                },
            });
        });
    }

    setupPageExitTracking() {
        window.addEventListener("beforeunload", () => {
            const timeSpent = (Date.now() - this.pageEnterTime) / 1000;

            this.recordEvent({
                type: "pageExit",
                timeSpent: Math.min(timeSpent / CONFIG.MAX_TIME_SPENT, 1),
                scrollDepth: this.maxScrollDepth,
                finalPage: true,
            });

            // Force send remaining events
            if (this.eventBuffer.length > 0) {
                this.sendBatchEvents();
            }
        });
    }

    startBatchProcessing() {
        setInterval(() => {
            if (this.eventBuffer.length > 0) {
                this.sendBatchEvents();
            }
        }, CONFIG.BATCH_INTERVAL);
    }

    inferAction(element) {
        const SELECTORS = {
            ADD_TO_CART: [
                '[data-testid="add-to-cart"]',
                '[id*="addToCart"]',
                ".add-to-cart",
            ],
            VIEW_DETAILS: ['[href*="/product/"]', '[id*="productDetails"]'],
            REVIEWS: ["#reviews", '[data-section="reviews"]'],
        };

        for (const [action, selectors] of Object.entries(SELECTORS)) {
            if (selectors.some((sel) => element.matches(sel))) {
                return ACTIONS[action];
            }
        }

        const text = element.innerText?.toLowerCase() || "";
        if (text.includes("add to cart")) return ACTIONS.ADD_TO_CART;
        if (text.includes("view details")) return ACTIONS.VIEW_DETAILS;

        return ACTIONS.DEFAULT_CLICK;
    }

    getCategory(domain, path) {
        if (domain.includes("amazon")) {
            if (path.includes("/dp/")) return CATEGORIES.PRODUCT_PAGE;
            if (path.split("/").includes("cart")) return CATEGORIES.CART;
            if (path.includes("/s?")) return CATEGORIES.SEARCH_RESULTS;
        }
        return DOMAIN_CATEGORIES.get(domain) || CATEGORIES.OTHER;
    }

    recordEvent(event) {
        const now = Date.now();
        const timeSinceLast = (now - this.lastActionTime) / 1000;

        const baseEvent = {
            sessionId: this.sessionId,
            deviceType: this.deviceInfo.type,
            os: this.deviceInfo.os,
            timestamp: now,
            timeSinceLast: Math.min(timeSinceLast / 60, 1),
            url: window.location.href,
        };

        this.eventBuffer.push({ ...baseEvent, ...event });
        this.lastActionTime = now;
    }

    recordInitialPageView() {
        const domain = window.location.hostname;
        const path = window.location.pathname;
        const category = this.getCategory(domain, path);

        this.recordEvent({
            type: "pageView",
            category,
            token: category,
        });
    }
    async sendBatchEvents() {
        try {
            if (this.eventBuffer.length === 0) return;

            const eventsToSend = [...this.eventBuffer];
            this.eventBuffer = []; // Clear buffer

            await browser.runtime.sendMessage({
                type: "batchEvent",
                events: eventsToSend,
            });
        } catch (error) {
            console.error("Failed to send events:", error);
            // Return events to buffer if send failed
            this.eventBuffer = [...this.eventBuffer, ...eventsToSend];

            // Implement exponential backoff retry if needed
            setTimeout(() => this.sendBatchEvents(), 5000);
        }
    }
}

// Initialize analytics
const analytics = new WebAnalytics();
