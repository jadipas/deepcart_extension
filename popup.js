document.getElementById("downloadData").addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "download" });
});
