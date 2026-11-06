/**
 * Center-crop an image to a square and downscale it in the browser, so
 * uploads are small and consistent. PNG keeps transparency (for logos and
 * icons); JPEG keeps photos small.
 */
export async function prepareSquareImage(
  file: File,
  size: number,
  type: "image/jpeg" | "image/png"
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file couldn't be read as an image. Try a JPEG or PNG.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(size, side);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser couldn't process the image.");
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    canvas.width,
    canvas.height
  );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the image."))),
      type,
      0.85
    )
  );
}

/**
 * Downscale a photo in the browser so its longest side is at most `maxSide`,
 * re-encoded as JPEG (at `quality`). Re-encoding also drops embedded metadata
 * such as the camera's GPS location.
 */
export async function preparePhoto(file: Blob, maxSide = 2400, quality = 0.85): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    const name = file instanceof File ? `“${file.name}”` : "That photo";
    throw new Error(`${name} couldn't be read as an image. Try a JPEG or PNG.`);
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser couldn't process the image.");
  context.fillStyle = "#ffffff"; // transparent areas become white rather than black
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the image."))),
      "image/jpeg",
      quality
    )
  );
}

/** Upload a prepared image as the raw request body; throws with the server's message on failure. */
export async function uploadImage(url: string, blob: Blob): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": blob.type },
    body: blob,
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((body) => body?.detail)
      .catch(() => null);
    throw new Error(detail ?? "Upload failed");
  }
}

/**
 * Add a photo to a circle's wiki; resolves to its address for the page. A
 * small PNG (a screenshot, a diagram) goes as it is, keeping it crisp;
 * anything else is downscaled and re-encoded as JPEG first.
 */
/** A photo for a wiki page (by its address). */
export async function uploadWikiImage(pageSlug: string, file: File): Promise<string> {
  const keep = file.type === "image/png" && file.size <= 1.5 * 1024 * 1024;
  const blob = keep ? file : await preparePhoto(file, 2000);
  const query = new URLSearchParams({ page: pageSlug });
  const res = await fetch(`/api/wiki/images?${query}`, {
    method: "POST",
    headers: { "Content-Type": blob.type },
    body: blob,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.url) throw new Error(body?.detail ?? "Upload failed");
  return body.url as string;
}
