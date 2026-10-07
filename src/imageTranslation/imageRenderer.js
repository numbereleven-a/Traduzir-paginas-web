/* global imageRenderer */
const imageRenderer = (() => {
  function wrap(ctx, text, width) {
    const lines = [];
    let line = "";
    for (const word of text.trim().split(/\s+/)) {
      const next = line ? line + " " + word : word;
      if (ctx.measureText(next).width <= width) {
        line = next;
      } else {
        if (line) lines.push(line);
        line = "";
        for (const letter of word) {
          if (line && ctx.measureText(line + letter).width > width) {
            lines.push(line);
            line = "";
          }
          line += letter;
        }
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function backgroundColor(ctx, box, width, height) {
    const colors = new Map();
    const sample = (x, y) => {
      const pixel = ctx.getImageData(Math.max(0, Math.min(width - 1, x)),
        Math.max(0, Math.min(height - 1, y)), 1, 1).data;
      const key = Array.from(pixel.slice(0, 3), (v) => Math.round(v / 16)).join(",");
      const color = colors.get(key) || { count: 0, rgb: [0, 0, 0] };
      color.count++;
      color.rgb.forEach((v, i) => { color.rgb[i] += pixel[i]; });
      colors.set(key, color);
    };
    for (let x = box.x0; x <= box.x1; x += 3) {
      sample(x, box.y0 - 2);
      sample(x, box.y1 + 2);
    }
    for (let y = box.y0; y <= box.y1; y += 3) {
      sample(box.x0 - 2, y);
      sample(box.x1 + 2, y);
    }
    const dominant = Array.from(colors.values()).sort((a, b) => b.count - a.count)[0];
    return dominant.rgb.map((v) => Math.round(v / dominant.count));
  }

  function draw(image, regions, translations, rtl) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    // Sample every background before covering any neighboring text.
    const colors = regions.map((region) => backgroundColor(ctx, region.bbox, canvas.width, canvas.height));
    regions.forEach((region, index) => {
      const box = region.bbox;
      const width = box.x1 - box.x0;
      const height = box.y1 - box.y0;
      let size = Math.max(8, Math.round(region.fontSize));
      let lines;
      for (; size >= 8; size--) {
        ctx.font = size + "px sans-serif";
        lines = wrap(ctx, translations[index], width);
        if (lines.length * size * 1.15 <= height) break;
      }
      if (size < 8) throw new Error("Translated text does not fit");
      const color = colors[index];
      ctx.fillStyle = "rgb(" + color.join(",") + ")";
      ctx.fillRect(Math.max(0, box.x0 - 2), Math.max(0, box.y0 - 2), width + 4, height + 4);
      ctx.fillStyle = color[0] * .299 + color[1] * .587 + color[2] * .114 > 150 ? "#111" : "#fff";
      ctx.textBaseline = "top";
      ctx.direction = rtl ? "rtl" : "ltr";
      ctx.textAlign = rtl ? "right" : "left";
      lines.forEach((line, i) => ctx.fillText(line, rtl ? box.x1 : box.x0, box.y0 + i * size * 1.15));
    });
    return canvas;
  }
  return { draw };
})();
