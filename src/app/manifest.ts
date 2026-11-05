import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GhostChat — Ephemeral Encrypted Messaging",
    short_name: "GhostChat",
    description: "A calm, private space for ephemeral 1:1 conversations with client-side end-to-end encryption.",
    start_url: "/",
    display: "standalone",
    background_color: "#07131b",
    theme_color: "#07131b",
    orientation: "any",
    categories: ["social", "security", "utilities"],
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
