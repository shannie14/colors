/**
 * colors — Palette definitions
 * Each palette is an array of [r, g, b] values (0–1 range).
 * The simulation randomly picks from the active palette when injecting dye.
 */

export const palettes = {
  'Deep Ocean': [
    [0.0, 0.1, 0.8],
    [0.0, 0.5, 1.0],
    [0.0, 0.9, 0.6],
    [0.1, 0.2, 0.5],
    [0.0, 0.7, 0.4],
    [0.3, 0.9, 0.1],
  ],
  'Neon Abyss': [
    [1.0, 0.0, 0.4],
    [0.0, 1.0, 0.8],
    [0.5, 0.0, 1.0],
    [1.0, 0.2, 0.0],
    [0.0, 0.4, 1.0],
    [0.9, 1.0, 0.0],
  ],
  'Molten Earth': [
    [1.0, 0.3, 0.0],
    [1.0, 0.7, 0.0],
    [0.8, 0.0, 0.0],
    [1.0, 0.9, 0.2],
    [0.5, 0.1, 0.0],
    [1.0, 0.5, 0.1],
  ],
  'Aurora': [
    [0.0, 1.0, 0.5],
    [0.2, 0.0, 1.0],
    [0.0, 0.8, 1.0],
    [0.5, 0.0, 0.8],
    [0.0, 1.0, 0.2],
    [0.8, 0.0, 1.0],
  ],
  'Bioluminescence': [
    [0.0, 0.3, 0.15],
    [0.0, 1.0, 0.6],
    [0.0, 0.5, 1.0],
    [0.1, 0.8, 0.3],
    [0.0, 0.2, 0.5],
    [0.3, 1.0, 0.8],
  ],
  'Cyberpunk': [
    [1.0, 0.0, 0.6],
    [0.0, 0.9, 1.0],
    [1.0, 1.0, 0.0],
    [0.6, 0.0, 1.0],
    [1.0, 0.4, 0.0],
    [0.0, 1.0, 0.3],
  ],
  'Ink & Gold': [
    [0.05, 0.02, 0.1],
    [0.9, 0.75, 0.3],
    [1.0, 0.85, 0.4],
    [0.1, 0.05, 0.2],
    [0.7, 0.55, 0.1],
    [0.02, 0.01, 0.05],
  ],
  'Coral Reef': [
    [1.0, 0.4, 0.5],
    [0.0, 0.8, 0.7],
    [1.0, 0.6, 0.2],
    [0.3, 0.2, 0.9],
    [1.0, 0.85, 0.4],
    [0.0, 0.5, 0.6],
  ],
};

export const paletteNames = Object.keys(palettes);

export function getRandomColor(paletteName) {
  const pal = palettes[paletteName] || palettes['Deep Ocean'];
  const c = pal[Math.floor(Math.random() * pal.length)];
  // Boost brightness for vivid splats
  const boost = 0.6 + Math.random() * 0.8;
  return {
    r: c[0] * boost,
    g: c[1] * boost,
    b: c[2] * boost,
  };
}
