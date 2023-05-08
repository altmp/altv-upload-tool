import crypto from "crypto";
import fs from "fs";
import klaw from "klaw";

export function debugLog(...args) {
    console.log('::debug::', ...args);
}

export async function hashFile(file) {
    const res = await new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha1');
        fs.createReadStream(file)
            .on('error', reject)
            .on('data', chunk => hash.update(chunk))
            .on('end', () => resolve(hash.digest('hex')));
    });
    debugLog('File hash', file, res);
    return res;
}

export function walk(dir, options) {
    return new Promise((resolve, reject) => {
        let items = [];
        klaw(dir, options)
            .on('data', item => items.push(item.path))
            .on('end', () => resolve(items))
            .on('error', (err, item) => reject(err, item));
    });
}