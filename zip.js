import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import klaw from 'klaw';
import { promisify } from 'util';
import { pipeline, PassThrough  } from 'stream';
import { debugLog } from "./utils.js";

const pipe = promisify(pipeline);

/**
 * Archiving a file by gzip
 * @param {string} source - Path to the source file
 * @param {string} destination - Path to the compressed file
 */
async function gzipFile(source, destination) {
  try {
    const sourceStream = fs.createReadStream(source);
    const gzipStream = zlib.createGzip();
    const destinationStream = fs.createWriteStream(destination);

    await pipe(sourceStream, gzipStream, destinationStream);
    debugLog(`Archiving completed: ${destination}`);
  } catch (error) {
    console.error(`Error archiving a file ${source}:`, error);
  }
}

/**
 * Archiving a file by gzip in memory without file
 * @param {string} source - Path to the source file
 */
export async function createGzipFileBuffer(source) {
  try {
    const sourceStream = fs.createReadStream(source);
    const gzipStream = zlib.createGzip();
    const passThrough = new PassThrough();

    return new Promise((resolve, reject) => {
      gzipStream.on('error', reject);
      gzipStream.on('end', () => {
      });

      let compressedChunks = [];
      passThrough.on('data', (chunk) => {
        compressedChunks.push(chunk);
      });
      
      passThrough.on('end', () => {
        const compressedData = Buffer.concat(compressedChunks);
        resolve(compressedData);
      });

      sourceStream.pipe(gzipStream)
      gzipStream.pipe(passThrough);
    });
  } catch (error) {
    console.error(`Error archiving a file ${source}:`, error);
  }
  return null;
}

/**
 * Recursive archiving all files in a directory
 * @param {string} dirPath - Path to directory
 */
async function gzipDirectoryRecursively(dirPath) {
  return new Promise((resolve, reject) => {
    const tasks = [];
    klaw(dirPath)
      .on('data', item => {
        if (!item.stats.isFile() || path.extname(item.path) != ".dll") {
          return;
        }
        const filePath = item.path;
        const gzipDestination = `${filePath}.gz`;
        tasks.push(async () => {
          debugLog(`Start archiving a file: ${filePath}`);
          await gzipFile(filePath, gzipDestination);
        });
      })
      .on('end', async () => {
        try {
          for (const task of tasks) {
            await task();
          }
          debugLog('Recursive archiving of all files is complete');
          resolve();
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (err, item) => {
        console.error(`Error during directory entering ${item.path}:`, err);
        reject(err);
      });
  });
}

/**
 * Сompress dll files
 * @param {string} filePath - Path to file or dir
 */
export function compressDllFiles(filePath) {
  let gzipTask;
  try {
    const stats = fs.statSync(filePath);
    if (stats.isFile() && path.extname(filePath) !== ".dll") {
      const gzipDestination = `${filePath}.gz`;
      debugLog(`Start file gzip process: ${filePath}`);
      gzipTask = gzipFile(filePath, gzipDestination);
    } else if (stats.isDirectory()) {
      debugLog(`Start dir gzip process: ${filePath}`);
      gzipTask = gzipDirectoryRecursively(filePath);
    } 
  } catch (error) {
    console.error(`Error processing gzip : ${error.message}`);
  }
  return gzipTask;
}
