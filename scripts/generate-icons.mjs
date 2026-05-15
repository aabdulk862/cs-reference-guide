/**
 * Generate PWA icons as valid PNG files.
 * Uses raw PNG encoding (no external dependencies).
 * Creates simple solid-color icons with the app's theme color.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(__dirname, '../public/icons');

mkdirSync(outputDir, { recursive: true });

function createPNG(width, height) {
  // Theme color #6366f1 = RGB(99, 102, 241)
  const themeR = 99, themeG = 102, themeB = 241;
  // Background color #1a1a2e = RGB(26, 26, 46)
  const bgR = 26, bgG = 26, bgB = 46;

  // Create raw pixel data (RGBA) with filter byte per row
  const rawData = Buffer.alloc((width * 4 + 1) * height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.4;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    rawData[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Inside circle: theme color
        rawData[pixelOffset] = themeR;
        rawData[pixelOffset + 1] = themeG;
        rawData[pixelOffset + 2] = themeB;
        rawData[pixelOffset + 3] = 255;
      } else {
        // Outside circle: background color
        rawData[pixelOffset] = bgR;
        rawData[pixelOffset + 1] = bgG;
        rawData[pixelOffset + 2] = bgB;
        rawData[pixelOffset + 3] = 255;
      }
    }
  }

  // Draw "CS" text as simple pixel art in the center
  const letterSize = Math.floor(width * 0.12);
  const startX = Math.floor(centerX - letterSize * 2.5);
  const startY = Math.floor(centerY - letterSize * 1.5);

  // Simple block letter patterns for "C" and "S"
  const drawBlock = (bx, by, bw, bh) => {
    for (let dy = 0; dy < bh; dy++) {
      for (let dx = 0; dx < bw; dx++) {
        const px = bx + dx;
        const py = by + dy;
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const rowOff = py * (width * 4 + 1);
          const pixOff = rowOff + 1 + px * 4;
          rawData[pixOff] = 255;
          rawData[pixOff + 1] = 255;
          rawData[pixOff + 2] = 255;
          rawData[pixOff + 3] = 255;
        }
      }
    }
  };

  const ls = letterSize;
  const t = Math.max(Math.floor(ls * 0.4), 2); // thickness

  // Letter "C"
  const cx = startX;
  const cy = startY;
  drawBlock(cx, cy, ls * 2, t);           // top
  drawBlock(cx, cy, t, ls * 3);           // left
  drawBlock(cx, cy + ls * 3 - t, ls * 2, t); // bottom

  // Letter "S"
  const sx = startX + ls * 3;
  const sy = startY;
  drawBlock(sx, sy, ls * 2, t);           // top
  drawBlock(sx, sy, t, ls * 1.5);         // top-left
  drawBlock(sx, sy + ls * 1.5 - t/2, ls * 2, t); // middle
  drawBlock(sx + ls * 2 - t, sy + ls * 1.5, t, ls * 1.5); // bottom-right
  drawBlock(sx, sy + ls * 3 - t, ls * 2, t); // bottom

  // Compress with zlib deflate
  const compressed = zlib.deflateSync(rawData);

  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate icons
console.log('Generating 192x192 icon...');
const icon192 = createPNG(192, 192);
writeFileSync(resolve(outputDir, 'icon-192.png'), icon192);
console.log(`  Created icon-192.png (${icon192.length} bytes)`);

console.log('Generating 512x512 icon...');
const icon512 = createPNG(512, 512);
writeFileSync(resolve(outputDir, 'icon-512.png'), icon512);
console.log(`  Created icon-512.png (${icon512.length} bytes)`);

console.log('Done! Icons generated in public/icons/');
