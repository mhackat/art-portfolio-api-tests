import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE_PATH = join(__dirname, "resized_testcat.png");

let cachedPngBuffer: Buffer | undefined;

export function pngBuffer(): Buffer {
  if (!cachedPngBuffer) {
    cachedPngBuffer = readFileSync(TEST_IMAGE_PATH);
  }
  return cachedPngBuffer;
}

export function pngFilePart(name = "artwork.png") {
  return { name, mimeType: "image/png", buffer: pngBuffer() };
}

export function oversizedPngFilePart(name = "too-big.png") {
  // Content doesn't need to be a valid PNG past the size check — the route
  // checks size before it ever decodes the bytes.
  return { name, mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) };
}

export function disallowedFilePart(name = "not-an-image.txt") {
  return { name, mimeType: "text/plain", buffer: Buffer.from("not an image") };
}
