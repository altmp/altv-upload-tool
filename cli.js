#!/usr/bin/env node

const path = require('path');
const { upload } = require('.');

async function start() {
  if (process.argv.length < 4) {
    console.log('USAGE: alt-upload [file] [cdn_path] [version]');
    return;
  }

  const filePath = path.resolve(process.argv[2]);
  const cdnPath = process.argv[3];
  const version = process.argv.length >= 5 ? process.argv[4] : null;
  
  upload(filePath, cdnPath, version)
}

start();
