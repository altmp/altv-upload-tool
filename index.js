const request = require('request');
const klaw = require('klaw');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

async function uploadFile(filePath, cdnPath) {
  if (!await _upload(fs.createReadStream(filePath, { encoding: null }), cdnPath)) {
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

async function upload(filePath, cdnPath, version) {
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

module.exports = {
  uploadDir,
  uploadFile,
  upload
}
