(() => {
  let imageUrl;
  document.addEventListener("contextmenu", (event) => {
    imageUrl = null;
    const hits = document.elementsFromPoint(event.clientX, event.clientY);
    for (const hit of hits) {
      const images = hit instanceof HTMLImageElement ? [hit] : hit.querySelectorAll("img");
      for (const image of images) {
        const rect = image.getBoundingClientRect();
        if (image.naturalWidth && event.clientX >= rect.left && event.clientX <= rect.right &&
          event.clientY >= rect.top && event.clientY <= rect.bottom) {
          imageUrl = image.currentSrc || image.src;
          break;
        }
      }
      if (imageUrl) break;
    }
  }, true);
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getContextImage") sendResponse(imageUrl);
  });
})();
