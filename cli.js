#!/usr/bin/env node

import path from 'path';
import { legacyUpload, s3upload, purgeCache } from './index.js';

async function start() {
  if (process.argv.length < 4) {
    console.log('USAGE: alt-upload [file] [cdn_path] [version]');
    return;
  }

  const filePath = path.resolve(process.argv[2]);
  const cdnPath = process.argv[3];
  const version = process.argv.length >= 5 ? process.argv[4] : null;
  
  // Legacy way to upload files
  if (process.env['CI_UPLOAD_URL']) {
    await legacyUpload(filePath, cdnPath, version);
  }

  // Upload to our R2 bucket
  if (process.env['AWS_KEY_ID']) {
    await s3upload(filePath, cdnPath, version);
  }

  // Automatically clear update.json cache
  if (process.env['CF_CACHE_PURGE_TOKEN']) {
    try {
      await purgeCache(filePath, cdnPath, version);
    }
    catch(err) {
      console.error(err);
    }
  }
}

start();
