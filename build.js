const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

console.log('Starting Smart Clipboard extension build...');

// List your JS files to obfuscate
const filesToObfuscate = [
  'background.js',
  'content.js',
  'encryption.js',
  'floating-clips.js'
];

// Files to copy without obfuscation
const filesToCopy = [
  'manifest.json',
  'popup.html',
  'styles.css',
  'floating-clips.css'
];

// Directories to copy
const directoriesToCopy = [
  'icons'
];

// Regular obfuscation options for content scripts
const contentScriptObfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: 1000,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: true,
  shuffleStringArray: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

// Special obfuscation options for background.js (service worker)
const serviceWorkerObfuscationOptions = {
  ...contentScriptObfuscationOptions,
  // Disable features that could reference window
  selfDefending: false,
  stringArray: false,
  // Add service worker specific options
  target: 'service-worker',  
  reservedNames: ['chrome'], // Prevent renaming chrome API references
};

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  console.log('Cleaning existing dist directory...');
  // Remove existing dist directory contents
  fs.rmSync(distDir, { recursive: true, force: true });
}

fs.mkdirSync(distDir, { recursive: true });
console.log('Created dist directory.');

// Process each file for obfuscation
console.log('Obfuscating JavaScript files...');
let obfuscationSuccess = true;

filesToObfuscate.forEach(file => {
  try {
    const filePath = path.join(__dirname, file);
    
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      obfuscationSuccess = false;
      return;
    }
    
    const code = fs.readFileSync(filePath, 'utf8');
    console.log(`Obfuscating ${file}...`);
    
    // Select the right obfuscation options based on file type
    const options = file === 'background.js' 
      ? serviceWorkerObfuscationOptions 
      : contentScriptObfuscationOptions;
    
    const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, options).getObfuscatedCode();
    fs.writeFileSync(path.join(distDir, file), obfuscatedCode);
    console.log(`✓ ${file} obfuscated successfully`);
  } catch (error) {
    console.error(`Error obfuscating ${file}:`, error);
    obfuscationSuccess = false;
  }
});

// Copy other necessary files
console.log('Copying additional files...');
filesToCopy.forEach(file => {
  try {
    const sourcePath = path.join(__dirname, file);
    
    if (!fs.existsSync(sourcePath)) {
      console.error(`Error: File not found: ${sourcePath}`);
      return;
    }
    
    fs.copyFileSync(sourcePath, path.join(distDir, file));
    console.log(`✓ ${file} copied`);
  } catch (error) {
    console.error(`Error copying ${file}:`, error);
  }
});

// Copy directories (like icons)
console.log('Copying directories...');
directoriesToCopy.forEach(dir => {
  try {
    const sourceDir = path.join(__dirname, dir);
    const targetDir = path.join(distDir, dir);
    
    if (!fs.existsSync(sourceDir)) {
      console.error(`Error: Directory not found: ${sourceDir}`);
      return;
    }
    
    // Create the target directory
    fs.mkdirSync(targetDir, { recursive: true });
    
    // Copy all files from the directory
    const files = fs.readdirSync(sourceDir);
    files.forEach(file => {
      const sourcePath = path.join(sourceDir, file);
      const targetPath = path.join(targetDir, file);
      
      if (fs.statSync(sourcePath).isFile()) {
        fs.copyFileSync(sourcePath, targetPath);
      }
    });
    
    console.log(`✓ ${dir} directory copied`);
  } catch (error) {
    console.error(`Error copying directory ${dir}:`, error);
  }
});

// Do not obfuscate popup.js by default as it would make debugging difficult
// But copy it to the dist directory
try {
  console.log('Copying popup.js (without obfuscation)...');
  fs.copyFileSync(
    path.join(__dirname, 'popup.js'), 
    path.join(distDir, 'popup.js')
  );
  console.log('✓ popup.js copied (not obfuscated for easier debugging)');
} catch (error) {
  console.error('Error copying popup.js:', error);
}

// Add ability to create ZIP file for Chrome Web Store submission
console.log('Creating package for Chrome Web Store submission...');

if (obfuscationSuccess) {
  console.log('\nBuild completed successfully!');
  console.log(`Extension files are ready in the ${distDir} directory.`);
  console.log('\nTo submit to Chrome Web Store:');
  console.log('1. Zip the contents of the dist folder');
  console.log('2. Upload the ZIP file to the Chrome Web Store Developer Dashboard');
} else {
  console.error('\nBuild completed with errors. Please check the logs above.');
}