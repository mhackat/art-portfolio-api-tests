// Smallest possible valid 1x1 PNG, inlined so tests don't depend on fixture
// files on disk. Good enough for upload/validation tests — nobody inspects
// pixels here, just content-type/size handling.
const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export function pngBuffer(): Buffer {
  return Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64");
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
