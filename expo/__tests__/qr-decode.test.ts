import { describe, expect, test } from 'bun:test';
import jsQR from 'jsqr';
import { generateQRMatrix } from '@/lib/qr-generator';

/**
 * Renders a QR matrix into RGBA pixel data (the same module data QRCodeView
 * draws as SVG) and decodes it with an independent decoder (jsQR) to prove the
 * generated QR encodes EXACTLY the destination URL.
 */
function matrixToRgba(matrix: boolean[][], scale: number, quietZone: number): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const modules = matrix.length;
  const size = (modules + quietZone * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (!matrix[r][c]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const y = (r + quietZone) * scale + dy;
          const x = (c + quietZone) * scale + dx;
          const i = (y * size + x) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    }
  }
  return { data, width: size, height: size };
}

function decodeQr(destination: string): string | null {
  const { matrix } = generateQRMatrix(destination);
  const grid: boolean[][] = matrix.map((row: number[]) => row.map((cell: number) => cell === 1));
  const { data, width, height } = matrixToRgba(grid, 8, 4);
  const result = jsQR(data, width, height);
  return result?.data ?? null;
}

describe('QR decode match (item 11): decoded QR equals destinationUrl', () => {
  test('property share link decodes to the exact destination', () => {
    const destination = 'https://ivxholding.com/property/casa-rosario?ref=ivx';
    expect(decodeQr(destination)).toBe(destination);
  });

  test('referral link decodes to the exact destination', () => {
    const destination = 'https://ipxholding.com/join?ref=IVX-PARTNER-01&utm_source=qr';
    expect(decodeQr(destination)).toBe(destination);
  });

  test('landing link decodes to the exact destination', () => {
    const destination = 'https://ivxholding.com';
    expect(decodeQr(destination)).toBe(destination);
  });

  test('longer tracked link decodes to the exact destination', () => {
    const destination = 'https://ivxholding.com/invest?utm_source=instagram&utm_medium=qr&utm_campaign=casa-rosario-launch';
    expect(decodeQr(destination)).toBe(destination);
  });
});
