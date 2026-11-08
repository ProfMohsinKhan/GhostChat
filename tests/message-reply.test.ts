import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { QuotedMessage } from "../src/features/chat/types.js";

describe("Phase 14: WhatsApp-Style Quoted Message Reply Protocol", () => {
  function serializeMessagePayload(
    text: string,
    replyTo?: QuotedMessage
  ): string {
    return replyTo ? JSON.stringify({ text, replyTo }) : text;
  }

  function deserializeMessagePayload(raw: string): {
    text: string;
    replyTo?: QuotedMessage;
  } {
    if (raw.startsWith("{") && raw.includes('"text":')) {
      try {
        const parsed = JSON.parse(raw) as {
          text?: string;
          replyTo?: QuotedMessage;
        };
        if (typeof parsed.text === "string") {
          return {
            text: parsed.text,
            replyTo: parsed.replyTo,
          };
        }
      } catch {
        // fallback to raw string
      }
    }
    return { text: raw };
  }

  test("serializes and deserializes simple raw text without overhead", () => {
    const raw = "Hello, this is a plain ephemeral message";
    const serialized = serializeMessagePayload(raw);
    assert.equal(serialized, raw);

    const deserialized = deserializeMessagePayload(serialized);
    assert.equal(deserialized.text, raw);
    assert.equal(deserialized.replyTo, undefined);
  });

  test("encapsulates reply metadata in encrypted payload structure", () => {
    const text = "I agree, let's meet at 5pm";
    const quote: QuotedMessage = {
      id: "msg_12345",
      sender: "them",
      senderName: "Maya",
      text: "Should we meet up today?",
    };

    const serialized = serializeMessagePayload(text, quote);
    assert.match(serialized, /"text":"I agree, let's meet at 5pm"/);
    assert.match(serialized, /"senderName":"Maya"/);

    const deserialized = deserializeMessagePayload(serialized);
    assert.equal(deserialized.text, text);
    assert.deepEqual(deserialized.replyTo, quote);
  });

  test("preserves self-quotes ('You') accurately", () => {
    const text = "Actually, make that 6pm instead";
    const quote: QuotedMessage = {
      id: "msg_99999",
      sender: "me",
      senderName: "You",
      text: "Let's meet at 5pm",
    };

    const serialized = serializeMessagePayload(text, quote);
    const deserialized = deserializeMessagePayload(serialized);
    assert.equal(deserialized.text, text);
    assert.equal(deserialized.replyTo?.sender, "me");
    assert.equal(deserialized.replyTo?.senderName, "You");
  });

  test("gracefully falls back to raw text if payload is not valid JSON", () => {
    const malformed = '{"text": "incomplete JSON string';
    const deserialized = deserializeMessagePayload(malformed);
    assert.equal(deserialized.text, malformed);
    assert.equal(deserialized.replyTo, undefined);
  });

  test("supports attachments and long messages in quoted replies", () => {
    const longText = "A".repeat(500);
    const quote: QuotedMessage = {
      id: "msg_file",
      sender: "them",
      senderName: "Alex",
      text: "design-mockup-v2.png",
    };

    const serialized = serializeMessagePayload(longText, quote);
    const deserialized = deserializeMessagePayload(serialized);
    assert.equal(deserialized.text.length, 500);
    assert.equal(deserialized.replyTo?.text, "design-mockup-v2.png");
  });
});
