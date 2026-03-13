# Faughnan Comics

Standalone GitHub Pages site for the digital comic reader.

## What is here

- `index.html`: comic bookshelf and reader homepage
- `comic-reader.js`: page navigation, swipe gestures, fullscreen, and zoom behavior
- `comic-reader.css`: site styling
- `comics/library.json`: bookshelf metadata
- `comics/cool-kids-stretch/manifest.json`: book metadata and optional panel zoom regions
- `comics/cool-kids-stretch/pages/`: optimized reading pages
- `comics/cool-kids-stretch/thumbnails/`: shelf and filmstrip thumbnails

## Publish

This repo is set up for GitHub Pages through GitHub Actions. Once the repo exists on GitHub and this project is pushed to `main`, the workflow in `.github/workflows/deploy-pages.yml` will deploy the site.

## Panel-by-panel zoom

The reader already supports manual panel targets. Add normalized panel rectangles to `comics/cool-kids-stretch/manifest.json` like this:

```json
"panels": {
  "3": [
    { "x": 0.05, "y": 0.07, "width": 0.41, "height": 0.24 },
    { "x": 0.51, "y": 0.09, "width": 0.38, "height": 0.25 }
  ]
}
```
