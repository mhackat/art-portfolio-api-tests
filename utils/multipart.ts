import { randomBytes } from "crypto";

type Field = { name: string; value: string };

/**
 * Builds a raw multipart/form-data body by hand. Needed because Playwright's
 * `multipart` request option silently drops fields whose value is an empty
 * string (verified against a raw curl -F "field=" call, which the app
 * handles correctly) — so an intentional "clear this field" test can't rely
 * on it. Only field values are supported; nothing here needs a file part.
 */
export function buildMultipartFields(fields: Field[]): { body: Buffer; contentType: string } {
  const boundary = `----playwright-test-${randomBytes(16).toString("hex")}`;
  const parts = fields.map((field) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`)
  );
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}
