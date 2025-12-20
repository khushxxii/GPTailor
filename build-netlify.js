const fs = require('fs');
const path = require('path');

// Copy public folder to netlify/functions for serverless access
const sourceDir = path.join(__dirname, 'public');
const destDir = path.join(__dirname, 'netlify', 'functions', 'public');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(sourceDir)) {
  copyRecursiveSync(sourceDir, destDir);
  console.log('✅ Copied public folder to netlify/functions/public');
} else {
  console.error('❌ Public folder not found!');
  process.exit(1);
}



