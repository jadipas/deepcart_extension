// Initialize a data matrix (array of arrays)
let dataMatrix = [];

// When a new page is visited, add a row to the matrix
function addPageData(domain, h1) {
    dataMatrix.push([domain, h1]);
    if (dataMatrix.length > 100) {
        // Remove the oldest row if the matrix has more than 10 rows
        dataMatrix.shift();
    }
}

function matrixToCSV(matrix) {
    return matrix.map((row) => row.join(",")).join("\n");
}

function saveDataToFile() {
    const csvContent = matrixToCSV(dataMatrix);
    const blob = new Blob([csvContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Trigger the download using the Downloads API
    browser.downloads
        .download({
            url: url,
            filename: "browsing_data.txt",
            saveAs: true, // This will prompt the user to choose the save location
        })
        .then(() => {
            console.log("Download initiated.");
        })
        .catch((err) => {
            console.error("Download failed:", err);
        });
}

// Listen for messages from content script and popup
browser.runtime.onMessage.addListener((message, sender) => {
    if (message.action === "download") {
        saveDataToFile();
    } else if (message.domain && message.h1 !== undefined) {
        // Log the received data and store it
        console.log("Visited domain:", message.domain);
        console.log("H1 text:", message.h1);
        addPageData(message.domain, message.h1);
    }
});
