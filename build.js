#!/usr/bin/env node

/**
 * Build script to process userscript files and replace @require URLs
 * for screeps-browser-core.js based on environment.
 * Supports watch mode for automatic rebuilding.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, watch } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SRC_DIR = join(__dirname, 'src');
const PUBLIC_DIR = join(__dirname, 'public');

// Get git remote origin URL to build GitHub Pages URL dynamically
function getGitHubPagesUrl() {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: __dirname,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    // Handle both SSH (git@github.com:user/repo.git) and HTTPS (https://github.com/user/repo.git) formats
    let repoPath;
    if (remoteUrl.startsWith('git@')) {
      // SSH format: git@github.com:user/repo.git
      repoPath = remoteUrl.replace('git@github.com:', '').replace(/\.git$/, '');
    } else if (remoteUrl.includes('github.com')) {
      // HTTPS format: https://github.com/user/repo.git
      const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
      if (match) {
        repoPath = match[1];
      } else {
        throw new Error('Could not parse GitHub URL');
      }
    } else {
      throw new Error('Not a GitHub repository');
    }

    // GitHub Pages URL format: https://username.github.io/repo-name
    const [username, repoName] = repoPath.split('/');
    return `https://${username}.github.io/${repoName}`;
  } catch (error) {
    console.error(`Error: Could not detect git remote origin: ${error.message}`);
    console.error('Make sure you are in a git repository with a GitHub remote configured.');
    process.exit(1);
  }
}

// Configuration
const env = process.env.BUILD_ENV || 'development';
const repoUrl = env === 'production' ? getGitHubPagesUrl() : 'http://localhost:8000';

// Process a single userscript file
function processUserscript(file) {
  const inputPath = join(SRC_DIR, file);
  const outputPath = join(PUBLIC_DIR, file);

  try {
    let content = readFileSync(inputPath, 'utf-8');

    content = content.replace(/REPO_URL\//g, `${repoUrl}/`);

    writeFileSync(outputPath, content, 'utf-8');
    console.log(`  ✓ ${file}`);
    return true;
  } catch (error) {
    console.error(`  ✗ Error processing ${file}: ${error.message}`);
    return false;
  }
}

// Generate index.html
function generateIndex(userscriptFiles) {
  const scripts = userscriptFiles.map(file => {
    const name = file.replace('.user.js', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const url = `${repoUrl}/${file}`;
    return { name, file, url };
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Screeps Browser Extensions</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
            color: #333;
        }
        h1 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 0.5rem;
        }
        .script-list {
            list-style: none;
            padding: 0;
        }
        .script-item {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 1rem;
            margin: 1rem 0;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .script-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .script-name {
            font-size: 1.2rem;
            font-weight: 600;
            color: #2c3e50;
            margin: 0 0 0.5rem 0;
        }
        .script-link {
            display: inline-block;
            background: #3498db;
            color: white;
            text-decoration: none;
            padding: 0.5rem 1rem;
            border-radius: 4px;
            margin-top: 0.5rem;
            transition: background 0.2s;
        }
        .script-link:hover {
            background: #2980b9;
        }
        .footer {
            margin-top: 3rem;
            padding-top: 2rem;
            border-top: 1px solid #dee2e6;
            color: #6c757d;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <h1>Screeps Browser Extensions</h1>
    <p>Collection of userscripts to enhance your Screeps experience. Click on any script to install it with your userscript manager (TamperMonkey, ViolentMonkey, etc.).</p>

    <ul class="script-list">
${scripts.map(script => `        <li class="script-item">
            <div class="script-name">${script.name}</div>
            <a href="${script.url}" class="script-link">Install ${script.file}</a>
        </li>`).join('\n')}
    </ul>

    <div class="footer">
        <p>These userscripts require <a href="${repoUrl}/screeps-browser-core.js">screeps-browser-core.js</a> to function.</p>
    </div>
</body>
</html>`;

  const indexPath = join(PUBLIC_DIR, 'index.html');
  writeFileSync(indexPath, html, 'utf-8');
  console.log(`  ✓ index.html`);
}

// Copy screeps-browser-core.js to public/
function copyCoreFile() {
  const coreFile = 'screeps-browser-core.js';
  const inputPath = join(SRC_DIR, coreFile);
  const outputPath = join(PUBLIC_DIR, coreFile);

  try {
    const content = readFileSync(inputPath, 'utf-8');
    writeFileSync(outputPath, content, 'utf-8');
    console.log(`  ✓ ${coreFile}`);
    return true;
  } catch (error) {
    console.error(`  ✗ Error copying ${coreFile}: ${error.message}`);
    return false;
  }
}

// Build all files
function buildAll() {
  console.log(`Building for ${env} environment...`);
  console.log(`Using repo URL: ${repoUrl}`);
  console.log(`Output directory: ${PUBLIC_DIR}`);
  console.log('');

  // Create output directory if needed
  mkdirSync(PUBLIC_DIR, { recursive: true });

  // Find all userscript files in src/
  const userscriptFiles = readdirSync(SRC_DIR)
    .filter(file => file.endsWith('.user.js'));

  console.log(`Processing ${userscriptFiles.length} userscript(s)...`);

  let successCount = 0;
  for (const file of userscriptFiles) {
    if (processUserscript(file)) {
      successCount++;
    }
  }

  // Copy screeps-browser-core.js
  console.log('\nCopying core file...');
  if (copyCoreFile()) {
    successCount++;
  }

  // Generate index.html
  generateIndex(userscriptFiles);

  console.log(`\nBuild complete! (${successCount}/${userscriptFiles.length + 1} files)`);
}

// Watch mode
function watchMode() {
  console.log('Watch mode enabled. Watching for changes in src/...\n');

  buildAll();

  watch(SRC_DIR, { recursive: false }, (eventType, filename) => {
    if (filename) {
      console.log(`\n[${new Date().toLocaleTimeString()}] File changed: ${filename}`);
      if (filename.endsWith('.user.js')) {
        processUserscript(filename);
        // Regenerate index.html
        const userscriptFiles = readdirSync(SRC_DIR)
          .filter(file => file.endsWith('.user.js'));
        generateIndex(userscriptFiles);
      } else if (filename === 'screeps-browser-core.js') {
        copyCoreFile();
      }
    }
  });

  console.log('\nPress Ctrl+C to stop watching...');
}

// Main
const isWatchMode = process.argv.includes('--watch') || process.argv.includes('-w');

if (isWatchMode) {
  watchMode();
} else {
  buildAll();
}
