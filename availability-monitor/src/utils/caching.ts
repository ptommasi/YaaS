// var fs = require('fs');
import fs from "fs";

const __CACHE_DIR__ = "./cache";

/**
 * A function to get cached data.
 * @param id     id is used to name the file, any "/" will create a sub folder
 * @returns      the content of the file, null if not found
 */
export function getCache<T>(fullPath: string): T {

  const fileName = `${__CACHE_DIR__}/${fullPath}.json`;

  if (!fs.existsSync(fileName)) {
    return null;
  }

  const cacheString = fs.readFileSync(fileName);

  return JSON.parse(cacheString.toString());

}

export function setCache<T>(fullPath: string, value: T) {

  const folders = fullPath.split("/");

  // Last part is the file name, not a folder remove it
  folders.pop();

  // Add the cache dir just to double check directory exists
  folders.unshift(__CACHE_DIR__);

  // Check that all directory tree exists before saving
  for(let i = 0; i < folders.length; i++) {
    // rebuilt the path till position i
    const currentFolder = folders.filter((v, j) => j <= i).join("/");
    if(!fs.existsSync(currentFolder)) {
      fs.mkdirSync(currentFolder);
    };
  }

  const fileName = `${__CACHE_DIR__}/${fullPath}.json`;

  const valueString = JSON.stringify(value, null, 2);

  fs.writeFileSync(fileName, valueString);

}