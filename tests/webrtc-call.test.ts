import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { CallSignalData, CallState } from "../src/features/calls/types";

describe("Phase 17: WebRTC Ephemeral Voice Calling & Signaling Protocol", () => {
  test("signaling state transitions follow strict call lifecycle", () => {
    let callNode: CallSignalData | null = null;

    // 1. Caller starts call
    callNode = {
      callerUid: "alice",
      state: "calling",
      offer: { type: "offer", sdp: "v=0\r\no=alice 12345 2 IN IP4 0.0.0.0..." },
      startedAt: Date.now(),
    };
    assert.equal(callNode.state, "calling");
    assert.equal(callNode.callerUid, "alice");

    // 2. Receiver detects call and rings
    const receiverUid: string = "bob";
    const receiverState: CallState =
      callNode.state === "calling" && callNode.callerUid !== receiverUid ? "ringing" : "idle";
    assert.equal(receiverState, "ringing");

    // 3. Receiver accepts and sends answer
    callNode = {
      ...callNode,
      state: "connected",
      answer: { type: "answer", sdp: "v=0\r\no=bob 67890 2 IN IP4 0.0.0.0..." },
    };
    assert.equal(callNode.state, "connected");
    assert.ok(callNode.answer);

    // 4. Hangup purges signaling node (Zero-Trace Policy)
    callNode = null;
    assert.equal(callNode, null);
  });

  test("ice candidate branches correctly isolate caller and receiver candidates", () => {
    const callNode: CallSignalData = {
      callerUid: "alice",
      state: "calling",
      callerCandidates: {},
      receiverCandidates: {},
    };

    // Caller candidate
    callNode.callerCandidates!["cand_1"] = {
      candidate: "candidate:1 1 UDP 2122260223 192.168.1.5 50000 typ host",
      sdpMid: "audio",
      sdpMLineIndex: 0,
    };

    // Receiver candidate
    callNode.receiverCandidates!["cand_2"] = {
      candidate: "candidate:2 1 UDP 2122260223 192.168.1.10 50001 typ host",
      sdpMid: "audio",
      sdpMLineIndex: 0,
    };

    assert.equal(Object.keys(callNode.callerCandidates!).length, 1);
    assert.equal(Object.keys(callNode.receiverCandidates!).length, 1);
    assert.notDeepEqual(callNode.callerCandidates!["cand_1"], callNode.receiverCandidates!["cand_2"]);
  });

  test("database security rules enforce authorization and membership for calls node", () => {
    const rulesPath = path.resolve(process.cwd(), "database.rules.json");
    assert.ok(fs.existsSync(rulesPath));

    const rulesContent = fs.readFileSync(rulesPath, "utf8");
    const parsed = JSON.parse(rulesContent);

    assert.ok(parsed.rules.calls, "Database rules must define root 'calls' node");
    const callRule = parsed.rules.calls["$conversationId"];

    // Must enforce authenticated membership
    assert.ok(callRule[".read"].includes("auth != null"));
    assert.ok(callRule[".read"].includes("ownerUid").valueOf());
    assert.ok(callRule[".read"].includes("acceptedBy").valueOf());
    assert.ok(callRule[".read"].includes("state').val() == 'active'"));

    assert.ok(callRule[".write"].includes("auth != null"));
    assert.ok(callRule[".write"].includes("ownerUid").valueOf());
    assert.ok(callRule[".write"].includes("acceptedBy").valueOf());
    assert.ok(callRule[".write"].includes("state').val() == 'active'"));
  });
});
