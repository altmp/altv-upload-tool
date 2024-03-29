import { Upload } from '@aws-sdk/lib-storage';
import {HeadObjectCommand, S3} from '@aws-sdk/client-s3';
import { lookup } from 'mime-types';
import { PromisePool } from '@supercharge/promise-pool';
import path from 'path';
import fs from 'fs';
import {debugLog as debugLog_, hashFile, walk} from "./utils.js";
const debugLog = (...args) => debugLog_('S3', ...args);

const AWS_KEY_ID = process.env['AWS_KEY_ID'];
const SECRET_ACCESS_KEY = process.env['AWS_SECRET_ACCESS_KEY'];
const BUCKET = process.env['AWS_BUCKET'];
const ENDPOINT = process.env['AWS_ENDPOINT'];

const s3 = new S3({
  credentials: {
    accessKeyId: AWS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY
  },
  region: 'auto',
  endpoint: ENDPOINT
});

async function uploadS3Internal(params) {
  await new Upload({
    client: s3,
    params
  }).done();
}

async function _upload(data, cdnPath, contentType) {
  debugLog('Upload', cdnPath, contentType);
  const params = {
    Bucket: BUCKET,
    ACL: 'public-read',
    Body: data,
    Key: cdnPath,
    ContentType: contentType,
  };
  try {
    await uploadS3Internal(params);
    return true;
  }
  catch(err) {
    console.error('Failed to upload to S3', err);
    return false;
  }
}

async function uploadFile(filePath, cdnPath, attempt = 0) {
  debugLog('Upload file', filePath, 'to', cdnPath, 'attempt', attempt);
  try {
    const size = (await fs.promises.stat(filePath)).size;
    const contentType = lookup(filePath) || 'application/octet-stream';
    if (await _upload(fs.createReadStream(filePath, {encoding: null}), cdnPath, contentType)) {
      console.log(`Uploaded '${filePath}' to '${cdnPath}'`);

      const head = await s3.send(new HeadObjectCommand({
        Bucket: BUCKET,
        Key: cdnPath
      }));

      if (+head.ContentLength === size) {
        return true;
      }

      console.error(`Uploaded file size doesnt match. Local size: ${size}. Uploaded size: ${head.ContentLength}`)
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

async function uploadDir(dirPath, cdnPath, version, sdkVersion) {
  dirPath = path.resolve(dirPath);
  debugLog('Upload dir', dirPath, 'to', cdnPath, version, sdkVersion);

  const files = await walk(dirPath);
  const hashes = { };
  const sizes = { };

  let result = true;

  const uploadQueue = [];

  console.log(files);

  for (let i = 0; i < files.length; ++i) {
    const file = files[i];

    const stats = fs.statSync(file);
    if (!stats.isDirectory()) {
      const filePath = file.replace(dirPath, '').substring(1).replace(/\\/g, '/');
      const key = (cdnPath.length > 0 ? (cdnPath + '/') : '') + filePath;
  
      hashes[filePath] = await hashFile(file);
      sizes[filePath] = stats.size;
      
      uploadQueue.push({ file, key });
    }
  }

  console.log(uploadQueue);

  const { results, errors } = await PromisePool.for(uploadQueue).withConcurrency(10).process(async queueItem => {
    return await uploadFile(queueItem.file, queueItem.key);
  });

  for (let i = 0; i < results.length; ++i) {
    if (!results[i]) {
      result = false;
    }
  }

  if (version) {
    debugLog('Generate update.json', version);
    const updateData = JSON.stringify({
      latestBuildNumber: -1,
      version: version,
      sdkVersion: sdkVersion || undefined,
      hashList: hashes,
      sizeList: sizes
    });
    
    if (!await _upload(updateData, cdnPath + '/update.json', 'application/json')) {
      console.error(`Error uploading 'update.json' to key '${cdnPath}/update.json'`);
      result = false;
    } else {
      console.log(`Uploaded 'update.json' to key '${cdnPath}/update.json'`);
    }
  }

  return result;
}

export async function upload(filePath, cdnPath, version, sdkVersion) {
  debugLog('Trying to upload', filePath, 'to', cdnPath, version, sdkVersion);
  if (fs.existsSync(filePath)) {
    if (fs.lstatSync(filePath).isDirectory()) {
      return uploadDir(filePath, cdnPath, version, sdkVersion);
    } else {
      return uploadFile(filePath, cdnPath);
    }
  } else {
    console.error('File not found');
    return false;
  }
}
