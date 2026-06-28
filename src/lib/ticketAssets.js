import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ASSETS_ROOT = path.join(__dirname, '../../assets');

const POSTER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const LOGO_SVG = path.join(ASSETS_ROOT, 'logo-with-text.svg');

function findPosterPath(eventSlug) {
  const posterDir = path.join(ASSETS_ROOT, 'posters');
  const candidates = [
    ...POSTER_EXTENSIONS.map((ext) => path.join(posterDir, `${eventSlug}${ext}`)),
    ...POSTER_EXTENSIONS.map((ext) => path.join(posterDir, `ticket-banner${ext}`)),
    ...POSTER_EXTENSIONS.map((ext) => path.join(posterDir, `art_gallery_poster${ext}`)),
    ...POSTER_EXTENSIONS.map((ext) => path.join(posterDir, `default${ext}`)),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export async function getLogoBuffer(width = 200) {
  if (!fs.existsSync(LOGO_SVG)) {
    return null;
  }

  return sharp(LOGO_SVG).png().resize(width, null, { fit: 'inside' }).toBuffer();
}

export async function getEventPosterBuffer(eventSlug) {
  const localPath = findPosterPath(eventSlug);
  if (localPath) {
    return sharp(localPath)
      .resize(720, 264, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  if (env.EVENT_POSTER_URL) {
    try {
      const response = await fetch(env.EVENT_POSTER_URL);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return sharp(Buffer.from(arrayBuffer)).jpeg({ quality: 90 }).toBuffer();
      }
    } catch {
      // fall through — PDF uses gradient banner
    }
  }

  return null;
}
