import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import nextConfig, { securityHeaders } from "../next.config";

test("Phase 12: Security Hardening, CSP, Frame Protection & Rules Verification", async (t) => {
  await t.test(
    "HTTP Security Headers & Frame Protection: Prevents framing, MIME sniffing, and clickjacking",
    async () => {
      assert.ok(typeof nextConfig.headers === "function");
      const headersConfig = await nextConfig.headers();
      assert.ok(Array.isArray(headersConfig));

      const allRouteHeaders = headersConfig.find((h) => h.source === "/(.*)");
      assert.ok(allRouteHeaders, "Must configure global headers for /(.*)");

      const headerMap = new Map(
        allRouteHeaders.headers.map((h: { key: string; value: string }) => [h.key, h.value])
      );

      // 1. Anti-Clickjacking: X-Frame-Options DENY
      assert.equal(
        headerMap.get("X-Frame-Options"),
        "DENY",
        "X-Frame-Options must be DENY"
      );

      // 2. Anti-MIME sniffing: X-Content-Type-Options nosniff
      assert.equal(
        headerMap.get("X-Content-Type-Options"),
        "nosniff",
        "X-Content-Type-Options must be nosniff"
      );

      // 3. Referrer-Policy: strict-origin-when-cross-origin
      assert.equal(
        headerMap.get("Referrer-Policy"),
        "strict-origin-when-cross-origin"
      );

      // 4. Permissions-Policy: Restricts sensitive ambient hardware access, allows self for WebRTC voice calls
      const permissionsPolicy = headerMap.get("Permissions-Policy");
      assert.ok(permissionsPolicy);
      assert.ok(permissionsPolicy.includes("camera=()"));
      assert.ok(permissionsPolicy.includes("microphone=(self)"));
      assert.ok(permissionsPolicy.includes("geolocation=()"));

      // 5. Strict-Transport-Security (HSTS)
      const hsts = headerMap.get("Strict-Transport-Security");
      assert.ok(hsts);
      assert.ok(hsts.includes("max-age=63072000"));
      assert.ok(hsts.includes("includeSubDomains"));

      // 6. Powered-By header disabled
      assert.equal(nextConfig.poweredByHeader, false);
    }
  );

  await t.test(
    "Content Security Policy (CSP): Enforces strict origin control and restricts external endpoints",
    () => {
      const cspHeader = securityHeaders.find((h) => h.key === "Content-Security-Policy");
      assert.ok(cspHeader, "Content-Security-Policy header must be present");
      const csp = cspHeader.value;

      // 1. Frame ancestors 'none' (CSP clickjacking defense)
      assert.ok(
        csp.includes("frame-ancestors 'none'"),
        "CSP must declare frame-ancestors 'none'"
      );

      // 2. Default origin restriction
      assert.ok(
        csp.includes("default-src 'self'"),
        "CSP must declare default-src 'self'"
      );

      // 3. Object-src 'none' (blocks Flash/applets)
      assert.ok(
        csp.includes("object-src 'none'"),
        "CSP must declare object-src 'none'"
      );

      // 4. Base-URI 'self' (prevents base injection)
      assert.ok(
        csp.includes("base-uri 'self'"),
        "CSP must declare base-uri 'self'"
      );

      // 5. Connect-src: Authorizes ONLY self and Firebase endpoints (denies telemetry / ad trackers)
      assert.ok(
        csp.includes("connect-src 'self'"),
        "CSP connect-src must allow 'self'"
      );
      assert.ok(
        csp.includes("https://*.firebaseio.com"),
        "CSP connect-src must allow Firebase RTDB HTTPS"
      );
      assert.ok(
        csp.includes("wss://*.firebaseio.com"),
        "CSP connect-src must allow Firebase RTDB WSS"
      );
      assert.ok(
        csp.includes("https://identitytoolkit.googleapis.com"),
        "CSP connect-src must allow Firebase Auth API"
      );
      assert.ok(
        csp.includes("https://securetoken.googleapis.com"),
        "CSP connect-src must allow Firebase SecureToken API"
      );

      // Ensure no wildcard or unintended domains are authorized
      assert.ok(
        !csp.includes("connect-src *"),
        "CSP must never use open wildcard for connect-src"
      );
    }
  );

  await t.test(
    "Database Security Rules: Root paths and default-deny validation",
    () => {
      const rulesPath = path.resolve(process.cwd(), "database.rules.json");
      assert.ok(fs.existsSync(rulesPath));

      const rulesContent = fs.readFileSync(rulesPath, "utf8");
      // Must be valid JSON
      const parsed = JSON.parse(rulesContent);
      assert.ok(parsed.rules);

      const rootKeys = Object.keys(parsed.rules);
      const expectedKeys = [
        "conversations",
        "userConversations",
        "messages",
        "presence",
        "typing",
        "calls",
      ];
      assert.deepEqual(rootKeys.sort(), expectedKeys.sort());
    }
  );

  await t.test(
    "Database Security Rules: Conversation rules enforce 24h boundary, entropy, and generation bumping",
    () => {
      const rulesContent = fs.readFileSync(
        path.resolve(process.cwd(), "database.rules.json"),
        "utf8"
      );
      const parsed = JSON.parse(rulesContent);
      const convRules = parsed.rules.conversations["$conversationId"];

      // Read rules require authenticated membership or valid pending invite
      assert.ok(convRules[".read"].includes("auth != null"));
      assert.ok(convRules[".read"].includes("ownerUid").valueOf());
      assert.ok(convRules[".read"].includes("acceptedBy"));
      assert.ok(convRules[".read"].includes("state").valueOf());

      // Write rules enforce creation, single acceptance, and generation bump
      assert.ok(convRules[".write"].includes("newData.child('state').val() == 'pending'"));
      assert.ok(convRules[".write"].includes("newData.child('state').val() == 'active'"));
      assert.ok(convRules[".write"].includes("newData.child('state').val() == 'destroyed'"));
      assert.ok(convRules[".write"].includes("generation"));

      // Validation enforces 22-char entropy regex and <= 86400000 ms (24h) lifetime
      assert.ok(convRules[".validate"].includes("matches(/^[A-Za-z0-9_-]{22}$/)"));
      assert.ok(convRules[".validate"].includes("86400000"));
      assert.ok(convRules[".validate"].includes("acceptedBy').val() != newData.child('ownerUid').val()"));

      // Prevents unknown field injection
      assert.equal(convRules["$other"][".validate"], false);
    }
  );

  await t.test(
    "Database Security Rules: Message rules enforce active generation, payload limits (<64KB), and IV length",
    () => {
      const rulesContent = fs.readFileSync(
        path.resolve(process.cwd(), "database.rules.json"),
        "utf8"
      );
      const parsed = JSON.parse(rulesContent);
      const msgRules =
        parsed.rules.messages["$conversationId"]["$generation"]["$messageId"];

      // Write rule enforces:
      // 1. Sender-only creation in active conversation
      assert.ok(msgRules[".write"].includes("newData.child('senderUid').val() == auth.uid"));
      assert.ok(msgRules[".write"].includes("state').val() == 'active'"));

      // 2. Recipient-only delivery receipt update
      assert.ok(msgRules[".write"].includes("delivered"));
      assert.ok(msgRules[".write"].includes("data.child('senderUid').val() != auth.uid"));

      // 3. Expiry sweep deletion
      assert.ok(msgRules[".write"].includes("expiresAt').val() <= now"));

      // Validation enforces:
      // Required children
      assert.ok(
        msgRules[".validate"].includes(
          "hasChildren(['ciphertext', 'iv', 'sequence', 'expiresAt', 'senderUid', 'ephemeralPublicKey'])"
        )
      );

      // Max ciphertext <= 65536 (<64KB)
      assert.ok(msgRules[".validate"].includes("length <= 65536"));

      // IV length == 16
      assert.ok(msgRules[".validate"].includes("length == 16"));

      // Ephemeral public key length 43..128
      assert.ok(msgRules[".validate"].includes("length >= 43"));
      assert.ok(msgRules[".validate"].includes("length <= 128"));

      // Tamper protection: immutable ciphertext, iv, senderUid, ephemeralPublicKey
      assert.ok(msgRules[".validate"].includes("newData.child('ciphertext').val() == data.child('ciphertext').val()"));

      // No undeclared fields
      assert.equal(msgRules["$other"][".validate"], false);
    }
  );

  await t.test(
    "Database Security Rules: Ephemeral presence & typing strictly isolated to conversation members",
    () => {
      const rulesContent = fs.readFileSync(
        path.resolve(process.cwd(), "database.rules.json"),
        "utf8"
      );
      const parsed = JSON.parse(rulesContent);

      const presenceRules = parsed.rules.presence["$conversationId"]["$uid"];
      assert.ok(presenceRules[".write"].includes("auth.uid == $uid"));
      assert.ok(presenceRules[".write"].includes("state').val() == 'active'"));
      assert.ok(presenceRules[".validate"].includes("online"));
      assert.ok(presenceRules[".validate"].includes("offline"));

      const typingRules = parsed.rules.typing["$conversationId"]["$uid"];
      assert.ok(typingRules[".write"].includes("auth.uid == $uid"));
      assert.ok(typingRules[".write"].includes("state').val() == 'active'"));
      assert.ok(typingRules[".validate"].includes("isBoolean"));
    }
  );
});
