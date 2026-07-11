import qrcode from 'qrcode-generator';

export interface QRMatrix {
  matrix: number[][];
  size: number;
  version: number;
}

/**
 * Generates a spec-compliant QR module matrix (EC level M, auto version) using
 * the battle-tested `qrcode-generator` encoder. The previous hand-rolled
 * encoder produced matrices that standard decoders (jsQR, phone cameras)
 * could not reliably read; this implementation is verified in automated tests
 * by decoding the rendered matrix with an independent decoder and asserting
 * the decoded value equals the input exactly.
 */
export function generateQRMatrix(text: string): QRMatrix {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();

  const size = qr.getModuleCount();
  const version = (size - 17) / 4;
  const matrix: number[][] = [];
  for (let r = 0; r < size; r++) {
    const row: number[] = new Array<number>(size);
    for (let c = 0; c < size; c++) {
      row[c] = qr.isDark(r, c) ? 1 : 0;
    }
    matrix.push(row);
  }

  return { matrix, size, version };
}
