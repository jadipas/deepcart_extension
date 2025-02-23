// Global event store for all recorded events
console.log("Background script loaded.");
let eventStore = [];

// Utility: Convert eventStore (array of objects) to CSV format
function eventsToCSV(events) {
    if (events.length === 0) return "";

    // Determine the union of keys in all events
    const keysSet = new Set();
    events.forEach((event) => {
        Object.keys(event).forEach((key) => keysSet.add(key));
    });
    const keys = Array.from(keysSet);

    // Create CSV header row
    const header = keys.join(",");

    // Map each event object to a CSV row
    const rows = events.map((event) => {
        return keys
            .map((key) => {
                let val = event[key] !== undefined ? event[key] : "";
                // If the value is a string, escape double quotes and wrap in quotes
                if (typeof val === "string") {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                // For objects (like coordinates), stringify them
                else if (typeof val === "object" && val !== null) {
                    val = '"' + JSON.stringify(val).replace(/"/g, '""') + '"';
                }
                return val;
            })
            .join(",");
    });

    return [header, ...rows].join("\n");
}

// Save the eventStore data to a CSV file
function saveDataToFile() {
    const csvContent = eventsToCSV(eventStore);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    browser.downloads
        .download({
            url: url,
            filename: "browsing_events.csv",
            saveAs: true, // Prompts the user to choose the save location
        })
        .then(() => {
            console.log("Download initiated.");
            eventStore = []; // Clear the event store after downloading
        })
        .catch((err) => {
            console.error("Download failed:", err);
        });
}

// Test function: simulate some dummy events
function runTest() {
    console.log("Running test: Adding dummy events to the event store.");
    const dummyEvent1 = {
        sessionId: "test-session",
        deviceType: "desktop",
        os: "TestOS",
        timestamp: Date.now(),
        timeSinceLast: 0.5,
        url: "https://example.com",
        type: "pageView",
        category: "TestCategory",
        token: 999,
    };

    const dummyEvent2 = {
        sessionId: "test-session",
        deviceType: "desktop",
        os: "TestOS",
        timestamp: Date.now() + 1000,
        timeSinceLast: 0.1,
        url: "https://example.com/test",
        type: "clickEvent",
        action: "TestAction",
        elementType: "BUTTON",
        coordinates: { x: 0.5, y: 0.5 },
    };

    eventStore.push(dummyEvent1, dummyEvent2);
    console.log(
        "Dummy events added. Current eventStore length:",
        eventStore.length
    );
    // Optionally trigger an immediate download of the test data
    saveDataToFile();
}

// Listen for messages from content scripts and popup
browser.runtime.onMessage.addListener((message, sender) => {
    if (message.action === "download") {
        // Download request from the popup: save the current event store in CSV format
        saveDataToFile();
    } else if (message.action === "test") {
        // Run the test function if a test message is received
        runTest();
    } else if (message.type === "batchEvent" && Array.isArray(message.events)) {
        // Append all events from the batch to the global event store
        eventStore.push(...message.events);
        console.log(
            "Received batch of events:",
            message.events.length,
            "Total events:",
            eventStore.length
        );
    } else {
        // Log any other messages for debugging purposes
        console.log("Received message:", message);
    }
});
