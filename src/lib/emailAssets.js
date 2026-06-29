import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { ASSETS_ROOT } from './ticketAssets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BANNER_CANDIDATES = [
  path.join(ASSETS_ROOT, 'posters', 'ticket-banner.jpg'),
  path.join(ASSETS_ROOT, 'posters', 'ticket-banner.png'),
  path.join(ASSETS_ROOT, 'posters', 'ticket-banner.jpeg'),
];

export const EMAIL_BANNER_CID = 'studio3-ticket-banner';

export async function getEmailBannerBuffer() {
  const localPath = BANNER_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (localPath) {
    return sharp(localPath)
      .resize(1200, null, { fit: 'inside', withoutEnlargement: false })
      .jpeg({ quality: 88 })
      .toBuffer();
  }

  const remoteUrl =
    env.EVENT_EMAIL_BANNER_URL ||
    `${env.PUBLIC_SITE_URL.replace(/\/$/, '')}/assets/Ticket%20Banner.jpg`;

  try {
    const response = await fetch(remoteUrl);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return sharp(Buffer.from(arrayBuffer))
        .resize(1200, null, { fit: 'inside', withoutEnlargement: false })
        .jpeg({ quality: 88 })
        .toBuffer();
    }
  } catch {
    // no banner available
  }

  return null;
}
