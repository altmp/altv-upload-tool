#!/usr/bin/env node

import path from 'path';
import { s3upload, purgeCache } from './index.js';
import { debugLog } from "./utils.js";


async function start() {
  if (process.argv.length < 3) {
    console.log('USAGE: alt-upload source_path [cdn_path] [version] [sdk_version]');
    return;
  }

  const filePath = path.resolve(process.argv[2]);
  const cdnPath = process.argv[3] ?? "";
  const version = process.argv.length >= 5 ? process.argv[4] : null;
  const sdkVersion = process.argv.length >= 6 ? process.argv[5] : null;
  
  // Upload to our R2 bucket
  if (process.env['AWS_KEY_ID']) {
    debugLog('S3 upload');
    await s3upload(filePath, cdnPath, version, sdkVersion);
  }

  // Automatically clear update.json cache
  if (process.env['CF_CACHE_PURGE_TOKEN']) {
    debugLog('Purge cache');
    try {
      await purgeCache(filePath, cdnPath, version);
    }
    catch(err) {
      console.error(err);
    }
  }
}

start();

