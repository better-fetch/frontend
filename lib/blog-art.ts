// Generative cover art for blog posts, derived entirely from the post's
// content hash — every byte of the design (colors, blob layout, dot grid)
// comes from the hash, so the art is stable for a given post and shifts
// whenever the content is edited.

// Catppuccin Mocha accents, matching the site palette in globals.css.
const PALETTE = [
  "#94e2d5", // teal
  "#cba6f7", // mauve
  "#fab387", // peach
  "#a6e3a1", // green
  "#89b4fa", // blue
  "#f5c2e7", // pink
  "#f9e2af", // yellow
  "#eba0ac", // maroon
];

const W = 800;
const H = 450;

export function blogArtSvg(hash: string): string {
  const bytes: number[] = [];
  for (let i = 0; i + 2 <= hash.length; i += 2) {
    bytes.push(parseInt(hash.slice(i, i + 2), 16));
  }
  const byte = (i: number) => bytes[i % bytes.length];
  const bit = (i: number) => (byte(i >> 3) >> (7 - (i % 8))) & 1;

  // Three blurred blobs in distinct accent colors. Adjacent hues (one
  // palette step apart) blend into each other instead of muddying toward
  // brown the way complementary pairs do; anchoring each blob to its own
  // horizontal third keeps the overlap partial.
  const firstColor = byte(0) % PALETTE.length;
  const blobs = [0, 1, 2].map((i) => {
    const color = PALETTE[(firstColor + i) % PALETTE.length];
    const cx = (W / 6) * (1 + 2 * i) + ((byte(1 + i * 3) - 128) / 128) * (W / 10);
    const cy = (H / 4) * (1 + (byte(2 + i * 3) % 3)) + ((byte(3 + i * 3) - 128) / 128) * (H / 8);
    const r = H * 0.28 + (byte(4 + i * 3) / 255) * H * 0.22;
    return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${color}" opacity="0.75"/>`;
  });

  // A dot-matrix fingerprint of the hash: 16x8 cells, one bit each (128 of
  // the 256 bits), so the grid literally is the contents.
  const cols = 16;
  const rows = 8;
  const cellW = W / cols;
  const cellH = H / rows;
  const dots: string[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!bit(row * cols + col)) continue;
      dots.push(
        `<circle cx="${(col * cellW + cellW / 2).toFixed(0)}" cy="${(row * cellH + cellH / 2).toFixed(0)}" r="2.5" fill="#cdd6f4" opacity="0.28"/>`,
      );
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">`,
    `<defs><filter id="blur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="50"/></filter></defs>`,
    `<rect width="${W}" height="${H}" fill="#11111b"/>`,
    `<g filter="url(#blur)">${blobs.join("")}</g>`,
    dots.join(""),
    `</svg>`,
  ].join("");
}
