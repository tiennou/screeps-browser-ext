# screeps-browser-ext

A collection of userscripts for Screeps that enhance the browser experience.

## Installation

Visit the [published userscripts](https://screepers.github.io/screeps-browser-ext/index.html) to install any of the available scripts.

## Development

### Project Structure

- `src/` - Source userscript files
- `public/` - Post-processed files
- `build.js` - Build script that processes source files

## Scripts

- `npm run build` - Build userscripts for local development
- `npm run build:prod` - Build userscripts for production
- `npm run watch` - Watch mode: automatically rebuilds on file changes
- `npm run serve` - Start a local HTTP server on port 8000
- `npm run lint` - Run ESLint

**Note:** All userscript source files in `src/` use the `REPO_URL` placeholder in both `@require` and `@downloadUrl` directives to support both local development and GitHub Pages publishing.