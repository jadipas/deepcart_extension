document.getElementById("downloadData").addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "download" });
});

// document.getElementById("testButton").addEventListener("click", () => {
//     browser.runtime.sendMessage({ action: "test" });
// });