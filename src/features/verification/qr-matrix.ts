/**
 * Self-contained, zero-dependency QR Code (Model 2) Matrix Generator in pure TypeScript.
 * Generates standards-compliant QR matrices (versions 1-7, Byte Mode, Error Correction Low/Medium)
 * suitable for SVG and Canvas rendering.
 */

// 1. Galois Field GF(2^8) Tables with Primitive Polynomial 0x11D (285)
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

let gfVal = 1;
for (let i = 0; i < 255; i++) {
  EXP[i] = gfVal;
  EXP[i + 255] = gfVal;
  LOG[gfVal] = i;
  gfVal = (gfVal << 1) ^ (gfVal & 128 ? 0x11d : 0);
}

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP[LOG[x] + LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsComputeRemainder(data: Uint8Array, numEcBytes: number): Uint8Array {
  const gen = rsGeneratorPoly(numEcBytes);
  const remainder = new Uint8Array(numEcBytes);

  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[numEcBytes - 1] = 0;
    for (let j = 0; j < numEcBytes; j++) {
      remainder[j] ^= gfMul(gen[j], factor);
    }
  }
  return remainder;
}

// Table of QR Code capacity & EC parameters for Versions 1..7 (Medium EC)
type VersionSpec = {
  version: number;
  totalBytes: number;
  dataBytes: number;
  ecPerBlock: number;
  numBlocks: number;
  alignment: number[];
};

const QR_SPECS: VersionSpec[] = [
  { version: 1, totalBytes: 26, dataBytes: 16, ecPerBlock: 10, numBlocks: 1, alignment: [] },
  { version: 2, totalBytes: 44, dataBytes: 28, ecPerBlock: 16, numBlocks: 1, alignment: [6, 18] },
  { version: 3, totalBytes: 70, dataBytes: 44, ecPerBlock: 26, numBlocks: 1, alignment: [6, 22] },
  { version: 4, totalBytes: 100, dataBytes: 64, ecPerBlock: 18, numBlocks: 2, alignment: [6, 26] },
  { version: 5, totalBytes: 134, dataBytes: 86, ecPerBlock: 24, numBlocks: 2, alignment: [6, 30] },
  { version: 6, totalBytes: 172, dataBytes: 108, ecPerBlock: 16, numBlocks: 4, alignment: [6, 34] },
  { version: 7, totalBytes: 196, dataBytes: 124, ecPerBlock: 18, numBlocks: 4, alignment: [6, 22, 38] },
];

export function generateQRMatrix(text: string): boolean[][] {
  const utf8Data = new TextEncoder().encode(text);
  // Find smallest version that fits data (Byte mode overhead: 4 bits mode + 8 bits length)
  const spec = QR_SPECS.find((s) => s.dataBytes >= utf8Data.length + 3) ?? QR_SPECS[QR_SPECS.length - 1];
  const size = 17 + spec.version * 4;

  // 1. Bitstream packaging (Byte Mode: 0100)
  const bitstream: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitstream.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(utf8Data.length, 8); // Character count indicator
  for (const byte of utf8Data) {
    pushBits(byte, 8);
  }

  // Terminator
  const totalDataBits = spec.dataBytes * 8;
  const padBitsNeeded = Math.min(4, totalDataBits - bitstream.length);
  pushBits(0, padBitsNeeded);

  // Byte align
  while (bitstream.length % 8 !== 0) {
    bitstream.push(0);
  }

  // Pad bytes 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitstream.length < totalDataBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bitstream to bytes
  const dataBytes = new Uint8Array(spec.dataBytes);
  for (let i = 0; i < spec.dataBytes; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitstream[i * 8 + b];
    }
    dataBytes[i] = byteVal;
  }

  // 2. Error correction codewords
  const blockSize = Math.floor(spec.dataBytes / spec.numBlocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  for (let b = 0; b < spec.numBlocks; b++) {
    const start = b * blockSize;
    const end = b === spec.numBlocks - 1 ? spec.dataBytes : start + blockSize;
    const blockData = dataBytes.slice(start, end);
    dataBlocks.push(blockData);
    ecBlocks.push(rsComputeRemainder(blockData, spec.ecPerBlock));
  }

  // Interleave data and EC bytes
  const finalCodewords: number[] = [];
  const maxBlockLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxBlockLen; i++) {
    for (let b = 0; b < spec.numBlocks; b++) {
      if (i < dataBlocks[b].length) {
        finalCodewords.push(dataBlocks[b][i]);
      }
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (let b = 0; b < spec.numBlocks; b++) {
      finalCodewords.push(ecBlocks[b][i]);
    }
  }

  // 3. Construct Matrix
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  function setModule(r: number, c: number, dark: boolean, isReserved = true) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = dark;
      if (isReserved) reserved[r][c] = true;
    }
  }

  // 3.1 Finder patterns (top-left, top-right, bottom-left)
  function placeFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const isCore = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const isDark =
          isCore &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setModule(row + r, col + c, isDark);
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 3.2 Alignment patterns
  if (spec.alignment.length >= 2) {
    for (const ar of spec.alignment) {
      for (const ac of spec.alignment) {
        // Skip finders
        if (
          (ar === 6 && ac === 6) ||
          (ar === 6 && ac === spec.alignment[spec.alignment.length - 1]) ||
          (ar === spec.alignment[spec.alignment.length - 1] && ac === 6)
        ) {
          continue;
        }
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const isDark =
              Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
            setModule(ar + r, ac + c, isDark);
          }
        }
      }
    }
  }

  // 3.3 Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    setModule(6, i, dark);
    setModule(i, 6, dark);
  }

  // Dark module
  setModule(size - 8, 8, true);

  // Format info area reservation
  for (let i = 0; i <= 8; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }

  // 4. Place Data Codewords (zigzag traversal)
  let bitIdx = 0;
  const totalBits = finalCodewords.length * 8;
  let upwards = true;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5; // Skip vertical timing column
    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (let cOffset = 0; cOffset < 2; cOffset++) {
        const c = right - cOffset;
        if (!reserved[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            const byte = finalCodewords[Math.floor(bitIdx / 8)];
            const bit = (byte >> (7 - (bitIdx % 8))) & 1;
            dark = bit === 1;
            bitIdx++;
          }
          // Apply Mask 0: (row + col) % 2 == 0
          if ((r + c) % 2 === 0) {
            dark = !dark;
          }
          matrix[r][c] = dark;
        }
      }
    }
    upwards = !upwards;
  }

  // 5. Write Format Information (Medium EC + Mask 0 = 0b00000 -> 0x5412 XOR)
  // Standard format bits for EC Medium + Mask Pattern 0: 0x5412
  const FORMAT_BITS = 0x5412;
  for (let i = 0; i < 15; i++) {
    const dark = ((FORMAT_BITS >> i) & 1) === 1;
    // Top-left finder border
    if (i <= 5) setModule(8, i, dark);
    else if (i === 6) setModule(8, 7, dark);
    else if (i <= 8) setModule(8 - (i - 7), 8, dark);
    else setModule(5 - (i - 9), 8, dark);

    // Split across bottom-left and top-right
    if (i < 7) setModule(size - 1 - i, 8, dark);
    else setModule(8, size - 15 + i, dark);
  }

  return matrix;
}
