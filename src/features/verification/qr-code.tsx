"use client";

import React, { useMemo } from "react";
import { generateQRMatrix } from "./qr-matrix";

type QRCodeProps = {
  value: string;
  size?: number;
  className?: string;
  ariaLabel?: string;
};

export function QRCode({
  value,
  size = 180,
  className = "",
  ariaLabel = "Cryptographic Security QR Code",
}: QRCodeProps) {
  const matrix = useMemo(() => {
    try {
      return generateQRMatrix(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix || matrix.length === 0) {
    return (
      <div
        className={`qr-fallback-box ${className}`}
        style={{ width: size, height: size }}
        aria-label={ariaLabel}
      >
        <span>QR Unavailable</span>
      </div>
    );
  }

  const moduleCount = matrix.length;
  // 2-module quiet zone padding
  const quietZone = 2;
  const viewBoxSize = moduleCount + quietZone * 2;

  // Build SVG path string for all dark modules for optimal rendering performance
  let pathD = "";
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        pathD += `M${c + quietZone},${r + quietZone}h1v1h-1z `;
      }
    }
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
      height={size}
      className={`qr-svg ${className}`}
      role="img"
      aria-label={ariaLabel}
      shapeRendering="crispEdges"
      style={{
        background: "#ffffff",
        borderRadius: "12px",
        padding: "8px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
      }}
    >
      <rect width="100%" height="100%" fill="#ffffff" rx="4" />
      <path d={pathD} fill="#0b1922" />
    </svg>
  );
}
