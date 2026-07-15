const EC_LEVEL_M = 0;

const ALIGNMENT_PATTERN_POSITIONS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const FORMAT_INFO_STRINGS: Record<number, number> = {
  0: 0x5412,
  1: 0x5125,
  2: 0x5E7C,
  3: 0x5B4B,
  4: 0x45F9,
  5: 0x40CE,
  6: 0x4F97,
  7: 0x4AA0,
};

function getVersion(dataLength: number): number {
  const capacities = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
  for (let i = 0; i < capacities.length; i++) {
    if (dataLength <= capacities[i]) return i + 1;
  }
  return 10;
}

function getSize(version: number): number {
  return 17 + version * 4;
}

function createMatrix(size: number): number[][] {
  const matrix: number[][] = [];
  for (let i = 0; i < size; i++) {
    matrix.push(new Array(size).fill(-1));
  }
  return matrix;
}

function addFinderPattern(matrix: number[][], row: number, col: number): void {
  const pattern = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  const size = matrix.length;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const mr = row + r;
      const mc = col + c;
      if (mr >= 0 && mr < size && mc >= 0 && mc < size) {
        matrix[mr][mc] = pattern[r][c];
      }
    }
  }
}

function addSeparators(matrix: number[][], size: number): void {
  for (let i = 0; i < 8; i++) {
    if (i < size) {
      if (matrix[7] && matrix[7][i] === -1) matrix[7][i] = 0;
      if (matrix[i] && matrix[i][7] === -1) matrix[i][7] = 0;
      if (matrix[7] && size - 8 + i < size && matrix[7][size - 8 + i] === -1) matrix[7][size - 8 + i] = 0;
      if (matrix[i] && matrix[i][size - 8] === -1) matrix[i][size - 8] = 0;
      if (matrix[size - 8] && matrix[size - 8][i] === -1) matrix[size - 8][i] = 0;
      if (matrix[size - 8 + i] && matrix[size - 8 + i][7] === -1) matrix[size - 8 + i][7] = 0;
    }
  }
}

function addTimingPatterns(matrix: number[][], size: number): void {
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === -1) matrix[6][i] = i % 2 === 0 ? 1 : 0;
    if (matrix[i][6] === -1) matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }
}

function addAlignmentPatterns(matrix: number[][], version: number): void {
  const positions = ALIGNMENT_PATTERN_POSITIONS[version];
  if (!positions || positions.length === 0) return;

  for (const row of positions) {
    for (const col of positions) {
      if (matrix[row][col] !== -1) continue;

      let overlaps = false;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          if (matrix[row + r] && matrix[row + r][col + c] !== -1) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) break;
      }
      if (overlaps) continue;

      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const val = Math.abs(r) === 2 || Math.abs(c) === 2 ? 1 : (r === 0 && c === 0 ? 1 : 0);
          if (matrix[row + r]) matrix[row + r][col + c] = val;
        }
      }
    }
  }
}

function addDarkModule(matrix: number[][], version: number): void {
  matrix[4 * version + 9][8] = 1;
}

function reserveFormatInfo(matrix: number[][], size: number): void {
  for (let i = 0; i < 8; i++) {
    if (matrix[8][i] === -1) matrix[8][i] = 0;
    if (matrix[i][8] === -1) matrix[i][8] = 0;
  }
  if (matrix[8][7] === -1) matrix[8][7] = 0;
  if (matrix[8][8] === -1) matrix[8][8] = 0;
  if (matrix[7][8] === -1) matrix[7][8] = 0;

  for (let i = 0; i < 7; i++) {
    if (matrix[size - 1 - i][8] === -1) matrix[size - 1 - i][8] = 0;
    if (matrix[8][size - 1 - i] === -1) matrix[8][size - 1 - i] = 0;
  }
  if (matrix[size - 8][8] === -1) matrix[size - 8][8] = 0;
}

function encodeData(text: string): number[] {
  const bits: number[] = [];

  bits.push(0, 1, 0, 0);

  const lenBits = text.length;
  for (let i = 7; i >= 0; i--) {
    bits.push((lenBits >> i) & 1);
  }

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    for (let b = 7; b >= 0; b--) {
      bits.push((charCode >> b) & 1);
    }
  }

  bits.push(0, 0, 0, 0);

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const version = getVersion(text.length);
  const capacityBits = getDataCapacityBits(version);

  const padBytes = [0xEC, 0x11];
  let padIdx = 0;
  while (bits.length < capacityBits) {
    const pb = padBytes[padIdx % 2];
    for (let b = 7; b >= 0; b--) {
      bits.push((pb >> b) & 1);
    }
    padIdx++;
  }

  return bits.slice(0, capacityBits);
}

function getDataCapacityBits(version: number): number {
  const capacities: Record<number, number> = {
    1: 128, 2: 224, 3: 352, 4: 512, 5: 688,
    6: 864, 7: 992, 8: 1232, 9: 1456, 10: 1728,
  };
  return capacities[version] || 128;
}

function placeData(matrix: number[][], bits: number[]): void {
  const size = matrix.length;
  let bitIndex = 0;
  let upward = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;

    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const currentCol = col - c;
        if (currentCol < 0 || currentCol >= size) continue;
        if (matrix[row][currentCol] !== -1) continue;

        if (bitIndex < bits.length) {
          matrix[row][currentCol] = bits[bitIndex];
          bitIndex++;
        } else {
          matrix[row][currentCol] = 0;
        }
      }
    }

    upward = !upward;
  }
}

function applyMask(matrix: number[][], reservedMatrix: number[][]): void {
  const size = matrix.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reservedMatrix[r][c] !== -1) continue;
      if ((r + c) % 2 === 0) {
        matrix[r][c] = matrix[r][c] ^ 1;
      }
    }
  }
}

function addFormatInfo(matrix: number[][], size: number): void {
  const formatInfo = FORMAT_INFO_STRINGS[EC_LEVEL_M];

  const bits: number[] = [];
  for (let i = 14; i >= 0; i--) {
    bits.push((formatInfo >> i) & 1);
  }

  const positions1 = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8],
    [2, 8], [1, 8], [0, 8],
  ];

  for (let i = 0; i < 15 && i < positions1.length; i++) {
    const [r, c] = positions1[i];
    if (r < size && c < size) matrix[r][c] = bits[i];
  }

  const positions2: number[][] = [];
  for (let i = 0; i < 7; i++) {
    positions2.push([size - 1 - i, 8]);
  }
  for (let i = 0; i < 8; i++) {
    positions2.push([8, size - 8 + i]);
  }

  for (let i = 0; i < 15 && i < positions2.length; i++) {
    const [r, c] = positions2[i];
    if (r < size && c < size) matrix[r][c] = bits[i];
  }
}

export interface QRMatrix {
  matrix: number[][];
  size: number;
  version: number;
}

export function generateQRMatrix(text: string): QRMatrix {
  console.log('[QR] Generating QR matrix for:', text);

  const version = getVersion(text.length);
  const size = getSize(version);

  const matrix = createMatrix(size);
  const reservedMatrix = createMatrix(size);

  addFinderPattern(matrix, 0, 0);
  addFinderPattern(matrix, 0, size - 7);
  addFinderPattern(matrix, size - 7, 0);
  addSeparators(matrix, size);
  addTimingPatterns(matrix, size);
  addAlignmentPatterns(matrix, version);
  addDarkModule(matrix, version);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] !== -1) reservedMatrix[r][c] = matrix[r][c];
    }
  }

  reserveFormatInfo(matrix, size);

  const dataBits = encodeData(text);
  placeData(matrix, dataBits);
  applyMask(matrix, reservedMatrix);
  addFormatInfo(matrix, size);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === -1) matrix[r][c] = 0;
    }
  }

  console.log('[QR] Matrix generated — version:', version, 'size:', size);
  return { matrix, size, version };
}
