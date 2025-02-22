// background.js

class AnalyticsDataManager {
    constructor() {
        this.dataMatrix = [];
        this.initializeListeners();
    }

    initializeListeners() {
        browser.runtime.onMessage.addListener((message, sender) => {
            if (message.type === "batchEvent") {
                this.processBatchEvents(message.events);
            } else if (message.action === "download") {
                this.saveDataToFile();
            }
        });
    }

    processBatchEvents(events) {
        events.forEach((event) => {
            // Extract relevant data from each event
            const row = this.formatEventData(event);
            this.addDataRow(row);
        });
    }

    formatEventData(event) {
        const domain = new URL(event.url).hostname;
        const timestamp = new Date(event.timestamp).toISOString();

        // Base data all events will have
        const baseData = [
            timestamp,
            domain,
            event.type,
            event.deviceType,
            event.os,
        ];

        // Add specific data based on event type
        switch (event.type) {
            case "pageView":
                return [...baseData, event.category, "", "", ""];
            case "clickEvent":
                return [
                    ...baseData,
                    "",
                    event.action,
                    `${event.coordinates.x},${event.coordinates.y}`,
                    "",
                ];
            case "searchQuery":
                return [...baseData, "", "", "", event.query];
            case "pageExit":
                return [
                    ...baseData,
                    "",
                    "",
                    "",
                    `Time:${event.timeSpent},Scroll:${event.scrollDepth}`,
                ];
            default:
                return [...baseData, "", "", "", ""];
        }
    }

    addDataRow(row) {
        this.dataMatrix.push(row);
        // Keep last 1000 events
        if (this.dataMatrix.length > 1000) {
            this.dataMatrix.shift();
        }
    }

    getHeaders() {
        return [
            "Timestamp",
            "Domain",
            "EventType",
            "DeviceType",
            "OS",
            "Category",
            "Action",
            "Coordinates",
            "AdditionalData",
        ];
    }

    matrixToCSV(matrix) {
        const headers = this.getHeaders();
        const headerRow = headers.join(",");
        const dataRows = matrix.map((row) =>
            row
                .map((cell) => {
                    // Escape commas and quotes in cell values
                    const cellStr = String(cell).replace(/"/g, '""');
                    return cellStr.includes(",") ? `"${cellStr}"` : cellStr;
                })
                .join(",")
        );

        return [headerRow, ...dataRows].join("\n");
    }

    async saveDataToFile() {
        try {
            const csvContent = this.matrixToCSV(this.dataMatrix);
            const blob = new Blob([csvContent], {
                type: "text/csv;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);

            const timestamp = new Date().toISOString().split("T")[0];
            const filename = `analytics_data_${timestamp}.csv`;

            await browser.downloads.download({
                url: url,
                filename: filename,
                saveAs: true,
            });

            console.log("Analytics data download initiated");

            // Cleanup
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to save analytics data:", error);
        }
    }
}

// Initialize the analytics data manager
const analyticsManager = new AnalyticsDataManager();
