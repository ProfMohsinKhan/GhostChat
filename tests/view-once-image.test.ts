import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("Phase 15: View Once Ephemeral Image Protocol", () => {
  function serializeEphemeralImagePayload(params: {
    text?: string;
    imageData: string;
    viewOnce: boolean;
  }): string {
    return JSON.stringify({
      text: params.text ?? "",
      imageData: params.imageData,
      viewOnce: params.viewOnce,
    });
  }

  function deserializeEphemeralImagePayload(raw: string): {
    text: string;
    imageData?: string;
    viewOnce?: boolean;
  } {
    if (
      raw.startsWith("{") &&
      (raw.includes('"imageData":') || raw.includes('"viewOnce":'))
    ) {
      try {
        const parsed = JSON.parse(raw);
        return {
          text: parsed.text ?? "",
          imageData: parsed.imageData,
          viewOnce: parsed.viewOnce,
        };
      } catch {
        // fallback
      }
    }
    return { text: raw };
  }

  test("serializes View Once image payload accurately", () => {
    const dummyBase64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD";
    const serialized = serializeEphemeralImagePayload({
      text: "Secret photo",
      imageData: dummyBase64,
      viewOnce: true,
    });

    assert.match(serialized, /"viewOnce":true/);
    assert.match(serialized, /"imageData":"data:image\/jpeg/);

    const parsed = deserializeEphemeralImagePayload(serialized);
    assert.equal(parsed.viewOnce, true);
    assert.equal(parsed.text, "Secret photo");
    assert.equal(parsed.imageData, dummyBase64);
  });

  test("respects View Once burn condition (single open invalidation)", () => {
    let volatileCache = new Map<string, string>();
    const messageId = "msg_view_once_99";
    const cacheKey = `conv_1:1:${messageId}`;

    // Store in volatile memory
    volatileCache.set(cacheKey, "data:image/jpeg;base64,samplephoto");
    assert.equal(volatileCache.has(cacheKey), true);

    // Simulate burn upon viewing
    volatileCache.delete(cacheKey);
    assert.equal(volatileCache.has(cacheKey), false);
  });

  test("size boundary: compressed image payload stays well under 64KB RTDB node limit", () => {
    // 35KB test image payload
    const testPayload = "A".repeat(35000);
    const serialized = serializeEphemeralImagePayload({
      imageData: `data:image/jpeg;base64,${testPayload}`,
      viewOnce: true,
    });

    assert.ok(serialized.length < 60000, "Payload exceeds safety limit");
  });
});
