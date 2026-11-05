import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isScreenshotKeyCombination,
  poisonClipboard,
} from "../src/features/security/screenshot-protection.js";

describe("Anti-Screenshot & Capture Protection System", () => {
  test("identifies direct PrintScreen / Snapshot key", () => {
    assert.equal(isScreenshotKeyCombination({ key: "PrintScreen" }), true);
    assert.equal(isScreenshotKeyCombination({ key: "Snapshot" }), true);
    assert.equal(isScreenshotKeyCombination({ key: "Unidentified", code: "PrintScreen" }), true);
  });

  test("identifies Alt + PrintScreen active window screenshot", () => {
    assert.equal(
      isScreenshotKeyCombination({ key: "PrintScreen", altKey: true }),
      true
    );
  });

  test("identifies Windows Snipping Tool (Ctrl/Cmd + Shift + S)", () => {
    assert.equal(
      isScreenshotKeyCombination({ key: "s", ctrlKey: true, shiftKey: true }),
      true
    );
    assert.equal(
      isScreenshotKeyCombination({ key: "S", metaKey: true, shiftKey: true }),
      true
    );
  });

  test("identifies macOS screen capture shortcuts (Cmd + Shift + 3/4/5)", () => {
    assert.equal(
      isScreenshotKeyCombination({ key: "3", metaKey: true, shiftKey: true }),
      true
    );
    assert.equal(
      isScreenshotKeyCombination({ key: "4", metaKey: true, shiftKey: true }),
      true
    );
    assert.equal(
      isScreenshotKeyCombination({ key: "5", metaKey: true, shiftKey: true }),
      true
    );
  });

  test("identifies Print / PDF capture (Ctrl/Cmd + P)", () => {
    assert.equal(isScreenshotKeyCombination({ key: "p", ctrlKey: true }), true);
    assert.equal(isScreenshotKeyCombination({ key: "P", metaKey: true }), true);
  });

  test("identifies DevTools plaintext inspection shortcuts", () => {
    assert.equal(isScreenshotKeyCombination({ key: "F12" }), true);
    assert.equal(
      isScreenshotKeyCombination({ key: "I", ctrlKey: true, shiftKey: true }),
      true
    );
    assert.equal(
      isScreenshotKeyCombination({ key: "u", ctrlKey: true }),
      true
    );
  });

  test("permits legitimate typing keystrokes without blocking", () => {
    assert.equal(isScreenshotKeyCombination({ key: "a" }), false);
    assert.equal(isScreenshotKeyCombination({ key: "Enter" }), false);
    assert.equal(isScreenshotKeyCombination({ key: "Backspace" }), false);
    assert.equal(isScreenshotKeyCombination({ key: "s" }), false);
    assert.equal(isScreenshotKeyCombination({ key: "p" }), false);
    assert.equal(isScreenshotKeyCombination({ key: " " }), false);
    assert.equal(isScreenshotKeyCombination({ key: "c", ctrlKey: true }), false); // Normal copy permitted unless right clicked
  });

  test("poisonClipboard handles environments without navigator gracefully", async () => {
    const res = await poisonClipboard();
    // In Node.js testing environment without DOM navigator, it should safely return false without throwing
    assert.equal(typeof res, "boolean");
  });
});
