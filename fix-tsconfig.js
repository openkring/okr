#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findTsconfigFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      findTsconfigFiles(fullPath, files);
    } else if (entry.isFile() && entry.name === 'tsconfig.lib.json') {
      files.push(fullPath);
    }
  }
  
  return files;
}

function fixTsConfig(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  let hasChanges = false;
  let newContent = content;
  
  // Remove rootDir line
  if (content.includes('"rootDir"')) {
    newContent = newContent.replace(/\s*"rootDir":\s*"\.?\/?\s*src\s*",?\s*\n/g, '');
    hasChanges = true;
  }
  
  // Fix trailing comma before closing brace if needed
  newContent = newContent.replace(/,(\s*\n\s*})/g, '$1');
  
  if (hasChanges) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Fixed: ${filePath}`);
    return true;
  }
  
  return false;
}

function main() {
  const libsDir = path.join(__dirname, 'libs');
  const tsconfigFiles = findTsconfigFiles(libsDir);
  
  console.log(`Found ${tsconfigFiles.length} tsconfig.lib.json files`);
  
  let fixedCount = 0;
  for (const file of tsconfigFiles) {
    const fixed = fixTsConfig(file);
    if (fixed) fixedCount++;
  }
  
  console.log(`\nFixed ${fixedCount} files`);
}

main();
