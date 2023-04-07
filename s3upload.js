import { Upload } from '@aws-sdk/lib-storage';
import { S3 } from '@aws-sdk/client-s3';
import { lookup } from 'mime-types';
import path from 'path';
import klaw from 'klaw';
import fs from 'fs';
import crypto from 'crypto';

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

function walk(dir, options) {
  return new Promise((resolve, reject) => {
    let items = [];
    klaw(dir, options)
      .on('data', item => items.push(item.path))
      .on('end', () => resolve(items))
      .on('error', (err, item) => reject(err, item));
  });
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    fs.createReadStream(file)
      .on('error', reject)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

async function _upload(data, cdnPath, contentType) {
  const params = {
    Bucket: BUCKET,
    ACL: 'public-read',
    Body: data,
    Key: cdnPath,
    ContentType: contentType,
  };
  return uploadS3Internal(params);
}

async function uploadFile(filePath, cdnPath) {
  const contentyType = lookup(filePath) || 'text/plain'
  if (!await _upload(fs.createReadStream(filePath, { encoding: null }), cdnPath, contentyType)) {
    console.error(`Error uploading '${filePath}' to '${cdnPath}'`);
    return false;
  }

  console.log(`Uploaded '${filePath}' to '${cdnPath}'`);
  return true;
}

async function uploadDir(dirPath, cdnPath, version) {
  dirPath = path.resolve(dirPath);

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
