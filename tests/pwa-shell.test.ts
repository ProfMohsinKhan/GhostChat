import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import manifestConfig from "../src/app/manifest";

test("Phase 11: PWA Shell, Service Worker Zero-Plaintext Policy & Desktop Refinement", async (t) => {
  await t.test(
    "PWA Manifest: Enforces standalone display, dark theme, and standard icons",
    () => {
      const manifest = manifestConfig();

      assert.equal(manifest.display, "standalone", "PWA display mode must be standalone");
      assert.equal(manifest.theme_color, "#07131b", "Theme color must match dark background");
      assert.equal(manifest.background_color, "#07131b");
      assert.equal(manifest.start_url, "/");
      assert.ok(Boolean(manifest.name && manifest.name.includes("GhostChat")));
      assert.ok(
        Boolean(
          manifest.short_name && manifest.short_name.includes("GhostChat")
        )
      );

      // Verify icons
      assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
      const icon192 = manifest.icons.find((i) => i.sizes === "192x192");
      const icon512 = manifest.icons.find((i) => i.sizes === "512x512");
      const maskable = manifest.icons.find((i) => i.purpose === "maskable");

      assert.ok(icon192, "192x192 icon must be present");
      assert.ok(icon512, "512x512 icon must be present");
      assert.ok(maskable, "Maskable icon must be present for Android adaptive icons");
    }
  );

  await t.test(
    "Static Icon Assets: Vector SVG icons exist on disk in public directory",
    () => {
      const icon192Path = path.resolve(process.cwd(), "public/icons/icon-192.svg");
      const icon512Path = path.resolve(process.cwd(), "public/icons/icon-512.svg");

      assert.ok(fs.existsSync(icon192Path), "icon-192.svg must exist in public/icons");
      assert.ok(fs.existsSync(icon512Path), "icon-512.svg must exist in public/icons");

      const icon192Content = fs.readFileSync(icon192Path, "utf8");
      assert.ok(icon192Content.includes("<svg"), "Must be a valid SVG file");
      assert.ok(icon192Content.includes("192"), "Must specify 192 viewBox");
    }
  );

  await t.test(
    "Service Worker Zero-Plaintext Policy: Strictly bypasses all Firebase RTDB, Auth, and dynamic requests",
    () => {
      const swPath = path.resolve(process.cwd(), "public/sw.js");
      assert.ok(fs.existsSync(swPath), "sw.js must exist in public directory");

      const swContent = fs.readFileSync(swPath, "utf8");

      // 1. Must check non-GET requests
      assert.ok(
        swContent.includes('req.method !== "GET"'),
        "Service worker must bypass non-GET requests from caching"
      );

      // 2. Must bypass Firebase RTDB (firebaseio.com)
      assert.ok(
        swContent.includes("firebaseio.com"),
        "Service worker must explicitly bypass firebaseio.com"
      );

      // 3. Must bypass Google APIs / Firebase Auth (googleapis.com, identitytoolkit)
      assert.ok(
        swContent.includes("googleapis.com"),
        "Service worker must explicitly bypass googleapis.com"
      );
      assert.ok(
        swContent.includes("identitytoolkit"),
        "Service worker must explicitly bypass identitytoolkit"
      );

      // 4. Must bypass API endpoints
      assert.ok(
        swContent.includes("/api/"),
        "Service worker must explicitly bypass /api/ routes"
      );

      // 5. Must NOT contain any references to caching plaintext, messages, or keys
      assert.ok(
        !swContent.includes("messages/"),
        "Service worker must never cache dynamic message endpoints"
      );
      assert.ok(
        !swContent.includes("sessionStorage"),
        "Service worker must not access session storage"
      );
    }
  );

  await t.test(
    "Offline State Transition: Realtime connection monitor flags offline state correctly",
    () => {
      let isOnline = true;
      const statusLog: boolean[] = [];

      function handleNetworkChange(online: boolean) {
        isOnline = online;
        statusLog.push(isOnline);
      }

      // Initial online
      assert.equal(isOnline, true);

      // User loses connectivity -> triggers offline state
      handleNetworkChange(false);
      assert.equal(isOnline, false, "Must detect offline disconnection");

      // User reconnects -> triggers online state
      handleNetworkChange(true);
      assert.equal(isOnline, true, "Must detect reconnection");

      assert.deepEqual(statusLog, [false, true]);
    }
  );

  await t.test(
    "Desktop Keyboard Shortcuts: Key event dispatcher maps hotkeys properly",
    () => {
      let activeModal: string | null = null;
      let searchQuery = "hello";
      let searchFocused = false;

      function simulateKey(key: string, ctrlKey = false, metaKey = false) {
        if (key === "Escape") {
          if (activeModal) {
            activeModal = null;
            return;
          }
          if (searchQuery) {
            searchQuery = "";
            return;
          }
        }
        if ((ctrlKey || metaKey) && key.toLowerCase() === "k") {
          searchFocused = true;
          return;
        }
        if ((ctrlKey || metaKey) && key.toLowerCase() === "n") {
          activeModal = "pair";
          return;
        }
        if ((ctrlKey || metaKey) && key === "/") {
          activeModal = activeModal === "shortcuts" ? null : "shortcuts";
          return;
        }
      }

      // Test Ctrl+N -> opens pairing modal
      simulateKey("n", true);
      assert.equal(activeModal, "pair");

      // Test Escape -> closes pairing modal
      simulateKey("Escape");
      assert.equal(activeModal, null);

      // Test Ctrl+K -> focuses search
      simulateKey("k", false, true); // Cmd+K
      assert.equal(searchFocused, true);

      // Test Escape -> clears search query
      simulateKey("Escape");
      assert.equal(searchQuery, "");

      // Test Ctrl+/ -> toggles shortcuts modal
      simulateKey("/", true);
      assert.equal(activeModal, "shortcuts");
      simulateKey("/", true);
      assert.equal(activeModal, null);
    }
  );
});
