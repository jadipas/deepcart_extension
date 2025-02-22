(function () {
    const domain = window.location.hostname;
    const h1Element = document.querySelector("h1");
    const h1 = h1Element ? h1Element.innerText : "";

    // Send the data to the background script
    browser.runtime.sendMessage({ domain, h1 });
})();
