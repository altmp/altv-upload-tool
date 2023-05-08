import request from 'request';
import klaw from 'klaw';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {debugLog as debugLog_, hashFile, walk} from "./utils.js";
const debugLog = (...args) => debugLog_('S3', ...args);

async function _upload(data, cdnPath) {
  return new Promise((resolve, reject) => {
    request({
      url: process.env['CI_UPLOAD_URL'],
      method: 'POST',
      qs: { path: cdnPath },
      headers: {
        'secret-token': process.env['CI_DEPLOY_TOKEN']
      },
      body: data
    }, (err, res) => {
      if(err) {
        return reject(err);
      }

      if(res.statusCode === 200) {
        return resolve(true);
      } else {
        return resolve(false);
      }
    });
  });
}

async function uploadFile(filePath, cdnPath, attempt = 0) {
  debugLog('Upload file', filePath, 'to', cdnPath, 'attempt', attempt);
  try {
    if (await _upload(fs.createReadStream(filePath, {encoding: null}), cdnPath)) {
      console.log(`Uploaded '${filePath}' to '${cdnPath}'`);
      return true;
    }

    console.error(`Error uploading '${filePath}' to '${cdnPath}'`);
  } catch(e) {
    console.error(e);
  }

  if (attempt < 3) {
    return uploadFile(filePath, cdnPath, attempt + 1);
  }

  console.log('Failed to upload', filePath, 'to', cdnPath, 'after 3 attempts');
  return false;
}

async function uploadDir(dirPath, cdnPath, version) {
  dirPath = path.resolve(dirPath);
  debugLog('Upload dir', dirPath, 'to', cdnPath, version);

  const files = await walk(dirPath);
  const hashes = { };
  const sizes = { };

  let result = true;

  await Promise.all(files.map(async file => {
    const stats = fs.statSync(file);
    if (!stats.isDirectory()) {
      const filePath = file.replace(dirPath, '').substring(1).replace(/\\/g, '/');
      const key = cdnPath + '/' + filePath;
  
      hashes[filePath] = await hashFile(file);
      sizes[filePath] = stats.size;

      if (!await uploadFile(file, key)) {
        result = false;
      }
    }
  }));

  if (version) {
    debugLog('Generate update.json', version);
    const updateData = JSON.stringify({
      latestBuildNumber: -1,
      version: version,
      hashList: hashes,
      sizeList: sizes
    });
    
    if (!await _upload(updateData, cdnPath + '/update.json')) {
      console.error(`Error uploading 'update.json' to key '${cdnPath}/update.json'`);
      result = false;
    } else {
      console.log(`Uploaded 'update.json' to key '${cdnPath}/update.json'`);
    }
  }

  return result;
}

export async function upload(filePath, cdnPath, version) {
  if (fs.existsSync(filePath)) {
    if (fs.lstatSync(filePath).isDirectory()) {
      return uploadDir(filePath, cdnPath, version);
    } else {
      return uploadFile(filePath, cdnPath, version);
    }
  } else {
    console.error('File not found');
    return false;
  }
}
