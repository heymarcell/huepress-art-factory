import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSettings } from '../ipc/settings';

import { ulid } from 'ulid';

export class StorageService {
  /**
   * Saves an image buffer to the assets directory.
   * Returns the absolute file path and SHA256 hash.
   */
  async saveImage(buffer: Buffer, ideaId: string, batchId: string): Promise<{ path: string; sha256: string }> {
    const settings = getSettings();
    if (!settings.assetsPath) {
      throw new Error('Assets path not configured in settings');
    }

    // Hash computation
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Create directory structure: assets/images/{batchId}/
    const imagesDir = path.join(settings.assetsPath, 'images');
    const batchDir = path.join(imagesDir, batchId);

    if (!fs.existsSync(batchDir)) {
      fs.mkdirSync(batchDir, { recursive: true });
    }

    // File path: {ideaId}_{ulid}.png to ensure uniqueness per attempt
    const filename = `${ideaId}_${ulid()}.png`;
    const filePath = path.join(batchDir, filename);

    // Write file
    await fs.promises.writeFile(filePath, buffer);

    return {
      path: filePath,
      sha256: hash,
    };
  }
}
