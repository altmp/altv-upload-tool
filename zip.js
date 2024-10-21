import fs from 'fs';
import zlib from 'zlib';
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
