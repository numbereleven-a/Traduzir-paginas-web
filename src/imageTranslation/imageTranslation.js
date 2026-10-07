/* global Tesseract, imageRenderer, twpConfig, twpI18n, twpLang, chrome */
(async () => {
  const $ = (id) => document.getElementById(id);
  let imageBlob;
  let previewUrl;
  let worker;
  let busy = false;
  let regions = [];
  let recognizedText = "";
  let downloadUrl;

  function resetImage() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
    $("downloadImage").hidden = true;
    $("downloadImage").removeAttribute("href");
    $("imageResult").replaceChildren();
    $("imageResult").hidden = true;
    $("showText").hidden = true;
    $("translated").hidden = false;
  }

  function status(key, error = false) {
    $("status").textContent = twpI18n.getMessage(key);
    $("status").classList.toggle("error", error);
  }

  function setBusy(value) {
    busy = value;
    $("recognize").disabled = value || !imageBlob;
    $("translate").disabled = value || !$("original").value.trim();
    $("original").disabled = value;
    $("ocrLanguage").disabled = value;
    $("targetLanguage").disabled = value;
    $("replaceImage").disabled = value || !regions.length;
    $("showText").disabled = value;
  }

  async function replaceImage() {
    if (busy || !regions.length) return;
    if ($("original").value !== recognizedText) {
      status("imageReplaceEdited", true);
      return;
    }
    resetImage();
    setBusy(true);
    status("imageReplaceWorking");
    try {
      const texts = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "translateText",
          translationService: twpConfig.get("textTranslatorService"),
          sourceLanguage: "auto",
          targetLanguage: $("targetLanguage").value,
          sourceArray: regions.map((region) => region.text),
        }, (response) => {
          if (chrome.runtime.lastError || !Array.isArray(response) ||
            response.length !== regions.length || response.some((text) => typeof text !== "string" || !text.trim())) {
            reject(new Error("Translation unavailable"));
          } else resolve(response);
        });
      });
      const canvas = imageRenderer.draw($("image"), regions, texts,
        twpLang.isRtlLanguage($("targetLanguage").value));
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Image export failed");
      downloadUrl = URL.createObjectURL(blob);
      $("downloadImage").href = downloadUrl;
      $("downloadImage").hidden = false;
      $("imageResult").appendChild(canvas);
      $("imageResult").hidden = false;
      $("translated").hidden = true;
      $("showText").hidden = false;
      $("translated").value = texts.join("\n\n");
      $("translated").dir = twpLang.isRtlLanguage($("targetLanguage").value) ? "rtl" : "ltr";
      status("imageReplaceReady");
    } catch {
      status("imageReplaceError", true);
    } finally {
      setBusy(false);
    }
  }

  async function translate() {
    const text = $("original").value.trim();
    if (!text) return;
    resetImage();
    setBusy(true);
    $("translated").value = "";
    status("imageTranslateTranslating");
    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "translateSingleText",
          translationService: twpConfig.get("textTranslatorService"),
          sourceLanguage: "auto",
          targetLanguage: $("targetLanguage").value,
          source: text,
        }, (response) => {
          if (chrome.runtime.lastError || typeof response !== "string" || !response.trim()) {
            reject(new Error("Translation unavailable"));
          } else {
            resolve(response);
          }
        });
      });
      $("translated").value = result;
      $("translated").dir = twpLang.isRtlLanguage($("targetLanguage").value) ? "rtl" : "ltr";
      status("imageTranslateDone");
    } catch {
      status("imageTranslateTranslationError", true);
    } finally {
      setBusy(false);
    }
  }

  async function recognize() {
    if (!imageBlob || busy) return;
    setBusy(true);
    resetImage();
    regions = [];
    $("original").value = "";
    $("translated").value = "";
    status("imageTranslateRecognizing");
    try {
      worker = await Tesseract.createWorker($("ocrLanguage").value, Tesseract.OEM.LSTM_ONLY, {
        workerPath: chrome.runtime.getURL("ocr/worker.min.js"),
        corePath: chrome.runtime.getURL("ocr/core"),
        langPath: chrome.runtime.getURL("ocr/lang"),
        workerBlobURL: false,
        cacheMethod: "none",
        errorHandler: () => {},
        logger: (message) => {
          if (message.status === "recognizing text") {
            $("status").textContent = twpI18n.getMessage("imageTranslateRecognizing") +
              " " + Math.round(message.progress * 100) + "%";
          }
        },
      });
      const result = await worker.recognize(imageBlob, {}, { text: true, blocks: true });
      $("original").value = result.data.text.trim();
      recognizedText = $("original").value;
      regions = (result.data.blocks || []).flatMap((block) => block.paragraphs)
        .filter((paragraph) => paragraph.text.trim() && paragraph.bbox.x1 > paragraph.bbox.x0 && paragraph.bbox.y1 > paragraph.bbox.y0)
        .map((paragraph) => ({
          text: paragraph.text.trim(),
          bbox: paragraph.bbox,
          fontSize: Math.max(...paragraph.lines.map((line) => line.bbox.y1 - line.bbox.y0)) * 1.25,
        }));
      if (!$("original").value) status("imageTranslateNoText");
    } catch {
      status("imageTranslateOcrError", true);
    } finally {
      if (worker) {
        await worker.terminate();
        worker = null;
      }
      setBusy(false);
    }
    if ($("original").value) await translate();
  }

  window.addEventListener("pagehide", () => {
    if (worker) worker.terminate();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  });

  await twpConfig.onReady();
  await twpI18n.updateUiMessages();
  twpI18n.translateDocument();
  document.title = twpI18n.getMessage("imageTranslateTitle");
  for (const [code, name] of Object.entries(twpLang.getLanguageList())) {
    $("targetLanguage").add(new Option(name, code));
  }
  $("targetLanguage").value = twpConfig.get("targetLanguageTextTranslation");
  $("recognize").addEventListener("click", recognize);
  $("translate").addEventListener("click", translate);
  $("replaceImage").addEventListener("click", replaceImage);
  $("showText").addEventListener("click", () => {
    $("imageResult").hidden = true;
    $("translated").hidden = false;
    $("showText").hidden = true;
  });
  $("targetLanguage").addEventListener("change", resetImage);
  $("original").addEventListener("input", () => {
    resetImage();
    setBusy(false);
  });

  status("imageTranslateLoading");
  setBusy(true);
  try {
    const url = new URL(new URLSearchParams(location.hash.slice(1)).get("image"));
    if (!["https:", "http:", "data:", "file:"].includes(url.protocol)) {
      throw new Error("Unsupported image URL");
    }
    const response = await fetch(url.href, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error("Image unavailable");
    const blob = await response.blob();
    previewUrl = URL.createObjectURL(blob);
    $("image").src = previewUrl;
    await $("image").decode();
    $("image").hidden = false;
    imageBlob = blob;
  } catch {
    status("imageTranslateLoadError", true);
  } finally {
    setBusy(false);
  }
  await recognize();
})();
