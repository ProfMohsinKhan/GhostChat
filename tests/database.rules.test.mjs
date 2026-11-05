import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { get, ref, set, update } from "firebase/database";

const projectId = "demo-ghostchat-phase3";
const inviteCode = "Y9nKxGd2QW5r7aBcDeF012";
const selfInviteCode = "N9nKxGd2QW5r7aBcDeF01x";
const longInviteCode = "A9nKxGd2QW5r7aBcDeF01x";
const olderInviteCode = "B9nKxGd2QW5r7aBcDeF01x";
const activeConvCode = "C9nKxGd2QW5r7aBcDeF012";
const day = 24 * 60 * 60 * 1000;
let testEnvironment;

before(async () => {
  const rules = await readFile(new URL("../database.rules.json", import.meta.url), "utf8");
  testEnvironment = await initializeTestEnvironment({
    projectId,
    database: { rules },
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

test("unauthenticated users cannot read or create invitations", async () => {
  const database = testEnvironment.unauthenticatedContext().database();
  await assertFails(get(ref(database, `conversations/${inviteCode}`)));
  await assertFails(update(ref(database), {
    [`conversations/${inviteCode}`]: pendingPairing("creator"),
    [`userConversations/creator/${inviteCode}`]: true,
  }));
});

test("a member can create a bounded, expiring private pairing atomically", async () => {
  const database = testEnvironment.authenticatedContext("creator").database();
  const createdAt = Date.now();
  await assertSucceeds(update(ref(database), {
    [`conversations/${inviteCode}`]: pendingPairing("creator", createdAt),
    [`userConversations/creator/${inviteCode}`]: true,
  }));

  const ownIndex = await assertSucceeds(get(ref(database, "userConversations/creator")));
  assert.equal(ownIndex.child(inviteCode).val(), true);
  await assertFails(set(ref(database, `userConversations/other/${inviteCode}`), true));
  await assertFails(get(ref(database, "userConversations/other")));
  await assertFails(get(ref(database, "conversations")));
});

test("invite code grants only pending-invite access, then one account may accept once", async () => {
  const inviteeDatabase = testEnvironment.authenticatedContext("invitee").database();
  const invite = await assertSucceeds(get(ref(inviteeDatabase, `conversations/${inviteCode}`)));
  const accepted = {
    ...invite.val(),
    state: "active",
    acceptedBy: "invitee",
    generation: 1,
  };

  await assertSucceeds(update(ref(inviteeDatabase), {
    [`conversations/${inviteCode}`]: accepted,
    [`userConversations/invitee/${inviteCode}`]: true,
  }));
  await assertSucceeds(get(ref(inviteeDatabase, `conversations/${inviteCode}`)));

  const thirdPartyDatabase = testEnvironment.authenticatedContext("third-party").database();
  await assertFails(get(ref(thirdPartyDatabase, `conversations/${inviteCode}`)));
  await assertFails(update(ref(thirdPartyDatabase), {
    [`conversations/${inviteCode}`]: { ...accepted, acceptedBy: "third-party" },
    [`userConversations/third-party/${inviteCode}`]: true,
  }));
});

test("self-acceptance and invites with more than 24 hours lifetime are rejected", async () => {
  const creatorDatabase = testEnvironment.authenticatedContext("creator").database();
  const now = Date.now();
  await assertSucceeds(update(ref(creatorDatabase), {
    [`conversations/${selfInviteCode}`]: pendingPairing("creator", now),
    [`userConversations/creator/${selfInviteCode}`]: true,
  }));
  const pairing = await get(ref(creatorDatabase, `conversations/${selfInviteCode}`));
  await assertFails(update(ref(creatorDatabase), {
    [`conversations/${selfInviteCode}`]: {
      ...pairing.val(),
      state: "active",
      acceptedBy: "creator",
    },
  }));

  const otherDatabase = testEnvironment.authenticatedContext("other-creator").database();
  const later = Date.now();
  await assertFails(update(ref(otherDatabase), {
    [`conversations/${longInviteCode}`]: {
      ...pendingPairing("other-creator", later),
      expiresAt: later + day + 60_000,
    },
    [`userConversations/other-creator/${longInviteCode}`]: true,
  }));
});

test("a still-valid invite can be accepted after its creation timestamp ages", async () => {
  const createdAt = Date.now() - 5 * 60 * 1000;
  const pairing = pendingPairing("older-creator", createdAt);
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), `conversations/${olderInviteCode}`), pairing);
  });

  const database = testEnvironment.authenticatedContext("older-invitee").database();
  await assertSucceeds(update(ref(database), {
    [`conversations/${olderInviteCode}`]: {
      ...pairing,
      state: "active",
      acceptedBy: "older-invitee",
      generation: 1,
    },
    [`userConversations/older-invitee/${olderInviteCode}`]: true,
  }));
});

test("message exchange: participants can send and read envelopes in active conversations", async () => {
  const createdAt = Date.now();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), `conversations/${activeConvCode}`), {
      ownerUid: "alice",
      acceptedBy: "bob",
      state: "active",
      createdAt,
      expiresAt: createdAt + day,
      generation: 1,
    });
  });

  const aliceDb = testEnvironment.authenticatedContext("alice").database();
  const bobDb = testEnvironment.authenticatedContext("bob").database();
  const eveDb = testEnvironment.authenticatedContext("eve").database();

  const msgId = "msg_001";
  const validEnvelope = {
    ciphertext: "encrypted_payload_hex",
    iv: "0123456789abcdef",
    sequence: 1,
    expiresAt: Date.now() + 20 * 60 * 1000,
    senderUid: "alice",
    ephemeralPublicKey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEephemeralPublic12345",
  };

  // Alice sends message in generation 1
  await assertSucceeds(
    set(ref(aliceDb, `messages/${activeConvCode}/1/${msgId}`), validEnvelope)
  );

  // Bob can read
  await assertSucceeds(get(ref(bobDb, `messages/${activeConvCode}/1/${msgId}`)));

  // Eve (third party) cannot read or write
  await assertFails(get(ref(eveDb, `messages/${activeConvCode}/1/${msgId}`)));
  await assertFails(
    set(ref(eveDb, `messages/${activeConvCode}/1/msg_eve`), {
      ...validEnvelope,
      senderUid: "eve",
    })
  );

  // Bob marks delivery acknowledged
  await assertSucceeds(
    update(ref(bobDb), {
      [`messages/${activeConvCode}/1/${msgId}/delivered`]: true,
    })
  );

  // Third party cannot modify delivery
  await assertFails(
    update(ref(eveDb), {
      [`messages/${activeConvCode}/1/${msgId}/delivered`]: true,
    })
  );
});

test("presence and typing: restricted to active conversation members", async () => {
  const aliceDb = testEnvironment.authenticatedContext("alice").database();
  const eveDb = testEnvironment.authenticatedContext("eve").database();

  // Alice sets her presence in active conversation
  await assertSucceeds(
    set(ref(aliceDb, `presence/${activeConvCode}/alice`), {
      status: "online",
      lastSeen: Date.now(),
    })
  );

  // Alice sets her typing status
  await assertSucceeds(set(ref(aliceDb, `typing/${activeConvCode}/alice`), true));

  // Eve cannot write Alice's presence or read it
  await assertFails(
    set(ref(eveDb, `presence/${activeConvCode}/alice`), {
      status: "offline",
      lastSeen: Date.now(),
    })
  );
  await assertFails(get(ref(eveDb, `presence/${activeConvCode}`)));
  await assertFails(get(ref(eveDb, `typing/${activeConvCode}`)));
});

function pendingPairing(ownerUid, createdAt = Date.now()) {
  return {
    ownerUid,
    state: "pending",
    createdAt,
    expiresAt: createdAt + day,
    generation: 1,
  };
}
