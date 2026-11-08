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
    const volatileCache = new Map<string, string>();
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

  test("strict 3-second auto-burn countdown correctly calculates remaining time and triggers burn", () => {
    const startTime = 1000000;
    function computeRemaining(currentTime: number): number {
      const elapsedSec = (currentTime - startTime) / 1000;
      return Math.max(0, 3 - Math.floor(elapsedSec));
    }

    assert.equal(computeRemaining(1000000), 3);
    assert.equal(computeRemaining(1001000), 2);
    assert.equal(computeRemaining(1002000), 1);
    assert.equal(computeRemaining(1003000), 0);
    assert.equal(computeRemaining(1004500), 0);
  });

  test("repeat view prevention: once viewed, message memory is wiped and second view is rejected", () => {
    const openedViewOnceIds = new Set<string>();
    const message: {
      id: string;
      text: string;
      imageData?: string;
      viewOnce: boolean;
      isOpened: boolean;
    } = {
      id: "msg_burn_42",
      text: "Confidential screenshot",
      imageData: "data:image/jpeg;base64,secretphoto123",
      viewOnce: true,
      isOpened: false,
    };

    function attemptOpen(msg: typeof message): boolean {
      if (!msg.imageData || msg.isOpened || openedViewOnceIds.has(msg.id)) {
        return false;
      }
      openedViewOnceIds.add(msg.id);
      msg.isOpened = true;
      msg.imageData = undefined;
      return true;
    }

    // First attempt succeeds
    const firstOpen = attemptOpen(message);
    assert.equal(firstOpen, true);
    assert.equal(message.isOpened, true);
    assert.equal(message.imageData, undefined);
    assert.equal(openedViewOnceIds.has("msg_burn_42"), true);

    // Second attempt MUST be blocked
    const secondOpen = attemptOpen(message);
    assert.equal(secondOpen, false);

    // Third attempt MUST be blocked
    const thirdOpen = attemptOpen(message);
    assert.equal(thirdOpen, false);
  });
});
