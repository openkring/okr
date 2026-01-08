#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

async function fixTsConfig(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Parse JSON (with comments)
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

async function main() {
  const tsconfigFiles = await glob('libs/**/tsconfig.lib.json', { 
    cwd: __dirname,
    absolute: true 
  });
  
  console.log(`Found ${tsconfigFiles.length} tsconfig.lib.json files`);
  
  let fixedCount = 0;
  for (const file of tsconfigFiles) {
    const fixed = await fixTsConfig(file);
    if (fixed) fixedCount++;
  }
  
  console.log(`\nFixed ${fixedCount} files`);
}

main().catch(console.error);
