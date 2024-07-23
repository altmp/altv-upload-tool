import Cloudflare from 'cloudflare';
import fs from 'fs';
import path from 'path';
import klaw from 'klaw';
import {walk} from "./utils.js";

const TOKEN = process.env['CF_CACHE_PURGE_TOKEN'];
const ZONE_ID = process.env['CF_CACHE_ZONE_ID'];
const PURGE_URL = process.env['CF_CACHE_PURGE_URL']; // Should be with "/" in the end

const CFClient = new Cloudflare({
  apiToken: TOKEN
});


function purgeFile(cdnPath) {
  return PURGE_URL + cdnPath;
}

async function purgeDir(dirPath, cdnPath, version) {
  const filesToPurge = [];
  dirPath = path.resolve(dirPath);
  const files = await walk(dirPath);

  for (let i = 0; i < files.length; ++i) {
    const file = files[i];
    const stats = fs.statSync(file);
    if (!stats.isDirectory()) {
      const filePath = file.replace(dirPath, '').substring(1).replace(/\\/g, '/');
      const key = cdnPath + '/' + filePath;
      filesToPurge.push(purgeFile(key));
    }
  }

  if (version) {
    filesToPurge.push(purgeFile(cdnPath + '/update.json'));
  }

  return filesToPurge;
}

async function clearCache(files) {
  const CHUNK_SIZE = 30;
  const chunks = [];

  // Split the files array into smaller arrays of CHUNK_SIZE items
  for (let i = 0; i < files.length; i += CHUNK_SIZE) {
    chunks.push(files.slice(i, i + CHUNK_SIZE));
  }

  // Call purgeCache on each subarray using Promise.all()
  const promises = chunks.map((chunk) => {
    return CFClient.cache.purge({
      zone_id: ZONE_ID,
      files: chunk
    });
  });

  return Promise.all(promises);
}

export async function purgeCache(filePath, cdnPath, version) {
  if (fs.existsSync(filePath)) {
    if (fs.lstatSync(filePath).isDirectory()) {
      const filesToPurge = await purgeDir(filePath, cdnPath, version);
      return clearCache(filesToPurge);
    } else {
      const toPurge = [ await purgeFile(filePath, cdnPath, version) ];
      return clearCache(toPurge);
    }
  } else {
    console.error('File not found');
    return false;
  }
}
