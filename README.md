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
- `comics/cool-kids-stretch/panels/`: guided-view panel JSON files named by page id

## Publish

This repo is set up for GitHub Pages through GitHub Actions. Once the repo exists on GitHub and this project is pushed to `main`, the workflow in `.github/workflows/deploy-pages.yml` will deploy the site.

## Guided panel view

The reader supports guided-view panel files using normalized coordinates from `0` to `1`. Add them as:

`comics/cool-kids-stretch/panels/<pageId>.json`

Example for page `12`:

```json
[
  { "id": "panel-1", "x": 0.05, "y": 0.07, "w": 0.41, "h": 0.24 },
  { "id": "panel-2", "x": 0.51, "y": 0.09, "w": 0.38, "h": 0.25 }
]
```
