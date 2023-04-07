import Cloudflare from 'cloudflare';
import fs from 'fs';

const TOKEN = process.env['CF_CACHE_PURGE_TOKEN'];
const ZONE_ID = process.env['CF_CACHE_ZONE_ID'];
const PURGE_URL = process.env['CF_CACHE_PURGE_URL']; // Should be with "/" in the end

const CFClient = new Cloudflare({
  token: TOKEN
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
  return CFClient.zones.purgeCache(ZONE_ID, {
    files
  })
}

export async function purgeCache(filePath, cdnPath, version) {
  if (fs.existsSync(filePath)) {
    if (fs.lstatSync(filePath).isDirectory()) {
      const filesToPurge = purgeDir(filePath, cdnPath, version);
      return clearCache(filesToPurge);
    } else {
      const toPurge = [ purgeFile(filePath, cdnPath, version) ];
      return clearCache(toPurge);
    }
  } else {
    console.error('File not found');
    return false;
  }
}
