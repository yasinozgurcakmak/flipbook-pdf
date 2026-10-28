// Generates examples/sample.pdf (numbered, colored pages) for local development.
import { writeFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE_COUNT = 16;
const [W, H] = [595, 842]; // A4 in points

const doc = await PDFDocument.create();
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const regular = await doc.embedFont(StandardFonts.Helvetica);

for (let i = 1; i <= PAGE_COUNT; i++) {
  const page = doc.addPage([W, H]);
  const hue = (i * 47) % 360;
  const [r, g, b] = hslToRgb(hue / 360, 0.55, 0.88);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(r, g, b) });

  if (i === 1) {
    page.drawText('PDF Flipbook', { x: 70, y: H / 2 + 40, size: 56, font: bold, color: rgb(0.1, 0.1, 0.2) });
    page.drawText('Sample document', { x: 72, y: H / 2 - 10, size: 22, font: regular, color: rgb(0.2, 0.2, 0.3) });
    continue;
  }

  const label = String(i);
  const size = 220;
  page.drawText(label, {
    x: (W - bold.widthOfTextAtSize(label, size)) / 2,
    y: H / 2 - size / 3,
    size,
    font: bold,
    color: rgb(0.15, 0.15, 0.25),
  });
  for (let line = 0; line < 6; line++) {
    page.drawText(`Line ${line + 1} of page ${i} - the quick brown fox jumps over the lazy dog.`, {
      x: 50,
      y: 140 - line * 16,
      size: 11,
      font: regular,
      color: rgb(0.25, 0.25, 0.3),
    });
  }
  page.drawText(`- ${i} -`, { x: W / 2 - 14, y: 40, size: 12, font: regular, color: rgb(0.3, 0.3, 0.35) });
}

await writeFile(new URL('../examples/sample.pdf', import.meta.url), await doc.save());
console.log(`examples/sample.pdf written (${PAGE_COUNT} pages)`);

function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
