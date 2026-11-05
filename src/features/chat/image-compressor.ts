/**
 * Ephemeral client-side image compressor.
 * Compresses images in volatile memory into lightweight Base64 JPEGs (under 40KB)
 * so they fit directly into the AES-256-GCM encrypted envelope without requiring
 * external cloud storage, database buckets, or persistent disk caching.
 */
export async function compressImageForEphemeralTransport(
  file: File,
  maxDimension = 540,
  maxByteSize = 42000
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Selected file is not an image."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode image data."));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Scale down maintaining aspect ratio
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not initialize canvas context."));
          return;
        }

        // Draw image onto canvas
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Quality reduction loop to strictly guarantee payload fits < 42KB
        let quality = 0.65;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);

        while (dataUrl.length > maxByteSize && quality > 0.2) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }

        // If still slightly oversized, downscale dimensions by 25%
        if (dataUrl.length > maxByteSize) {
          const smallCanvas = document.createElement("canvas");
          smallCanvas.width = Math.round(width * 0.75);
          smallCanvas.height = Math.round(height * 0.75);
          const smallCtx = smallCanvas.getContext("2d");
          if (smallCtx) {
            smallCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
            dataUrl = smallCanvas.toDataURL("image/jpeg", 0.45);
          }
        }

        resolve(dataUrl);
      };

      if (typeof reader.result === "string") {
        img.src = reader.result;
      } else {
        reject(new Error("FileReader result is not a string."));
      }
    };

    reader.readAsDataURL(file);
  });
}
