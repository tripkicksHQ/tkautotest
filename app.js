// @ts-nocheck
require('dotenv').config();
const express = require('express');
const { Client } = require('@notionhq/client');

const app = express();
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PORT = process.env.PORT || 3000;

// Format a JS date as MM.DD.YY_HH:MM
function formatDate(dt) {
  if (!dt) return '';
  const pad = n => String(n).padStart(2, '0');
  const d = new Date(dt);
  return `${pad(d.getMonth()+1)}.${pad(d.getDate())}.${String(d.getFullYear()).slice(-2)}_${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function extractHtml(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'rich_text':
      return prop.rich_text.map(rt => rt.plain_text).join('');
    case 'title':
      return prop.title.map(rt => rt.plain_text).join('');
    case 'formula':
      return prop.formula.string || '';
    case 'plain_text':
      return prop.plain_text || '';
    default:
      return '';
  }
}

function extractText(prop) {
  if (!prop) return '';
  if (prop.type === 'title' && prop.title.length)
    return prop.title.map(t => t.plain_text).join('');
  if (prop.type === 'rich_text' && prop.rich_text.length)
    return prop.rich_text.map(t => t.plain_text).join('');
  if (prop.type === 'formula') {
    if (prop.formula.type === 'string' && prop.formula.string !== null)
      return prop.formula.string;
    if (prop.formula.type === 'number' && prop.formula.number !== null)
      return String(prop.formula.number);
  }
  if (typeof prop.plain_text === 'string')
    return prop.plain_text;
  return '';
}

// Basic HTML sanitization to prevent XSS
function sanitizeHtml(html) {
  if (!html) return '';
  // This is a basic sanitization. For production, consider using a library like DOMPurify
  return html
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

app.get('/', async (req, res) => {
  let liveTile = '', liveModal = '', pendingTile = '', pendingModal = '', errorMsg = '';
  let tkid3 = '', lastEdited = '', client = '';
  
  // Check if there's a specific ID requested via query parameter
  const requestedId = req.query.id;

  try {
    // Check if required environment variables are set
    if (!process.env.NOTION_TOKEN || !process.env.DATABASE_ID) {
      throw new Error('Missing required environment variables: NOTION_TOKEN or DATABASE_ID');
    }

    let page;
    
    if (requestedId) {
      // For requested ID like "Bloom.1012", search for matching tkid1
      console.log('Searching for tkid1:', requestedId);
      
      // Query for the specific record using tkid1
      const searchResults = await notion.databases.query({
        database_id: process.env.DATABASE_ID,
        filter: {
          property: 'tkid1',
          formula: {
            string: {
              equals: requestedId
            }
          }
        }
      });
      
      console.log('Search results:', searchResults.results.length);
      
      if (searchResults.results.length > 0) {
        page = searchResults.results[0];
      } else {
        errorMsg = `<div style="color:#c00; padding:1em;">No record found for ID: ${requestedId}</div>`;
      }
    } else {
      // Default behavior - get the last edited
      const db = await notion.databases.query({
        database_id: process.env.DATABASE_ID,
        page_size: 1,
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
      });
      
      if (db.results.length) {
        page = db.results[0];
      }
    }

    if (page && !errorMsg) {
      // Extract values from the page
      tkid3       = extractText(page.properties['TK id']) || 'tkid';
      const tkid1Value = extractText(page.properties['tkid1']) || '';
      
      // Extract client name from tkid1 (e.g., "Bloom" from "Bloom.1012")
      if (tkid1Value && tkid1Value.includes('.')) {
        client = tkid1Value.split('.')[0];
      } else {
        client = 'Client';
      }
      
      lastEdited  = page.last_edited_time;
      liveTile    = sanitizeHtml(extractHtml(page.properties['Tile HTML']));
      liveModal   = sanitizeHtml(extractHtml(page.properties['Modal HTML']));
      pendingTile = sanitizeHtml(extractHtml(page.properties['Builder ⓵ TILE']));
      pendingModal= sanitizeHtml(extractHtml(page.properties['Builder ⓵ MODAL']));
    } else if (!errorMsg) {
      errorMsg = `<div style="color:#c00; padding:1em;">No pages found in database.</div>`;
    }
  } catch (e) {
    console.error('Error fetching from Notion:', e);
    errorMsg = `<div style="color:#c00; padding:1em;">Error: ${e.message}</div>`;
  }

  if (!liveTile)      liveTile    = `<div style="padding:0.5em;color:#fff;background:#156eff;">No HTML found in <b>Tile HTML</b>.</div>`;
  if (!liveModal)     liveModal   = `<div style="padding:0.5em;color:#222;">No HTML found in <b>Modal HTML</b>.</div>`;
  if (!pendingTile)   pendingTile = `<div style="padding:0.5em;color:#fff;background:#156eff;">No HTML found in <b>Builder ⓵ TILE</b>.</div>`;
  if (!pendingModal)  pendingModal= `<div style="padding:0.5em;color:#222;">No HTML found in <b>Builder ⓵ MODAL</b>.</div>`;

  const mainShadow = `0 16px 48px rgba(36,40,70,0.15), 0 4px 22px rgba(36,40,70,0.09), 0 1.5px 10px rgba(36,40,70,0.08)`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>tkAuto Notion Live Preview</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://info.tripkicks.com/hubfs/system/mockup/tk-css.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
  <style>
    html, body { background:#fff; color:#222; font-family:system-ui; margin:0; padding:0; }
    .main-wrapper { max-width:1280px; margin:2em auto; width:98%; }
    .preview-row { display:flex; gap:3vw; justify-content:center; align-items:flex-start; min-height:900px; }
    .preview-col {
      flex:1 1 0; min-width:340px; max-width:620px;
      display:flex; flex-direction:column;
      background:#f6f9fc;
      border:1.5px solid #fff;
      border-top-left-radius:18px;
      border-top-right-radius:18px;
      border-bottom-left-radius:0;
      border-bottom-right-radius:0;
      box-shadow:${mainShadow};
      margin-bottom:24px; padding-bottom:0; position:relative;
      min-height:800px;
    }
    .card-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .card-live-header, .card-pending-header {
      padding:9px 22px 7px; font-size:1rem; font-weight:400;
      border-top-left-radius:18px; border-top-right-radius:18px;
    }
    .card-live-header    { background:#427bff; color:#f5f7fa; }
    .card-pending-header { background:#434c5c; color:#f6f9fc; }
    .tile-preview-row, .modal-preview-row { display:flex; align-items:center; margin:20px 0 4px; }
    .tile-preview-label, .modal-label {
      color:#bac2d2; font-size:.92rem; font-weight:500; opacity:.70; margin-left:22px;
    }
    .tile-preview-controls, .modal-preview-controls { margin-left:auto; margin-right:20px; display:flex; gap:6px; align-items:center; }
    .tile-size-btn, .modal-size-btn {
      background:transparent; border:none; border-radius:5px;
      font-size:1.18rem; width:22px; height:22px;
      color:#ccd4e3; opacity:.6; cursor:pointer;
      transition:background .12s, color .12s;
    }
    .tile-size-btn:hover, .modal-size-btn:hover {
      background:#f3f6fb; color:#427bff; opacity:.95;
    }
    .font-size-control {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: 12px;
      padding: 2px 6px;
      background: #f0f4f9;
      border-radius: 6px;
    }
    .font-size-btn {
      background: transparent;
      border: none;
      border-radius: 4px;
      font-size: 0.85rem;
      width: 20px;
      height: 20px;
      color: #8899b8;
      cursor: pointer;
      transition: all 0.12s;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
    }
    .font-size-btn:hover {
      background: #e3e9f2;
      color: #427bff;
    }
    .font-size-indicator {
      font-size: 0.75rem;
      color: #7388a9;
      min-width: 30px;
      text-align: center;
      font-family: 'Menlo', 'Consolas', monospace;
    }
    .tile-html-preview-box {
      background:#156eff; color:#fff;
      border-radius:0; border:1px solid #fff;
      box-shadow:0 6px 32px rgba(36,40,70,0.16);
      display:flex; font-size:1.08rem; font-weight:500;
      margin:0 22px 10px; min-height:40px;
      overflow-x:auto; transition:width .3s, font-size .2s;
      width:360px; max-width:94%;
      padding: 0.25em 0.5em; /* Reduced padding from 1em to 0.25em/0.5em */
    }
    .tile-html-preview-box.pending {
      border-radius:12px; box-shadow:0 12px 48px rgba(36,40,70,0.18);
    }
    .light-divider { background:#e5e9f0; height:2px; margin:20px auto 16px; width:92%; border-radius:1px; }
    .modal-html-preview-box {
      background:#fff; color:#1a1a1a;
      border:1.5px solid #eaf0fc; border-radius:7px;
      box-shadow:0 6px 32px rgba(36,40,70,0.15);
      margin:0 22px 12px; height:650px;
      overflow:auto; transition:width .3s, height .3s, font-size .2s;
      width:520px; max-width:100%;
      scrollbar-width: thin; scrollbar-color:#dde1ee #f6f9fc;
      padding: 0.5em 1em; /* Reduced padding from default to 0.5em/1em */
    }
    /* Override any internal padding for modal content */
    .modal-html-preview-box > * {
      margin: 0 !important;
    }
    .modal-html-preview-box > div:first-child {
      padding-left: 0 !important;
      padding-right: 0 !important;
    }
    .modal-html-preview-box::-webkit-scrollbar { width:6px; background:#f6f9fc; }
    .modal-html-preview-box::-webkit-scrollbar-thumb {
      background:#dde1ee; border-radius:4px; min-height:24px;
    }
    .modal-html-preview-box:hover::-webkit-scrollbar-thumb {
      background:#bac6e4;
    }
    .footer-bar {
      width:100%; text-align:left; padding:4px 0 9px 18px;
      font-size:.89em; color:#9db0d7; opacity:.96;
      letter-spacing:.03em; font-weight:500;
      font-family:'Menlo','Consolas','monospace',system-ui;
      margin-top: auto;
    }
    .footer-bar i { font-style:italic; opacity:.88; letter-spacing:.04em; }
    .icon-bar { 
      display:flex; gap:10px; margin:0 0 0 18px; 
      align-items:center; padding-bottom: 10px; 
      flex-wrap: wrap; position: relative; 
    }
    .icon-bar.hide-for-capture { display:none!important; }
    .icon-btn {
      background:transparent; border:none; border-radius:7px;
      color:#b6bac5; cursor:pointer; display:flex;
      align-items:center; justify-content:center;
      font-size:1.23rem; width:34px; height:34px;
      padding:0; opacity:.7; position: relative;
      transition:background .15s, color .14s;
    }
    .icon-btn:hover { background:#f3f6fb; color:#427bff; opacity:1; }
    .icon-btn.tk-branded {
      background-image: url('https://info.tripkicks.com/hubfs/system/ausTk.png');
      background-size: 22px 22px;
      background-position: center;
      background-repeat: no-repeat;
      opacity: 0.5;
    }
    .icon-btn.tk-branded:hover {
      opacity: 0.8;
      background-color: #f3f6fb;
    }
    .icon-btn.tk-branded i {
      opacity: 0;
    }
    .icon-btn .tooltip {
      position:absolute; bottom:100%; left:50%;
      transform:translateX(-50%) translateY(-8px);
      background:#31343c; color:#fff; padding:6px 10px;
      border-radius:6px; white-space:nowrap;
      font-size:.75rem; font-weight:500;
      opacity:0; visibility:hidden;
      transition: opacity 0.2s ease, visibility 0.2s ease;
      z-index:1000;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .icon-btn .tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border-width: 5px;
      border-style: solid;
      border-color: #31343c transparent transparent transparent;
    }
    .icon-btn:hover .tooltip { 
      opacity:1; 
      visibility:visible; 
    }
    .copy-success {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #21921c;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      opacity: 0;
      transform: translateY(-10px);
      transition: all 0.3s ease;
      z-index: 1000;
    }
    .copy-success.show {
      opacity: 1;
      transform: translateY(0);
    }
    .secret-input-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  opacity: 0.05;
  transition: opacity 0.5s ease;
  z-index: 999;
}
.secret-input-container:hover {
  opacity: 0.8;
}
.secret-input {
  padding: 6px 10px;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  font-size: 0.8rem;
  width: 120px;
  background: #fafafa;
  color: #999;
  font-family: 'Consolas', 'Monaco', monospace;
}
.secret-input:focus {
  outline: none;
  border-color: #ddd;
  background: #fff;
  color: #333;
  opacity: 1;
}
.secret-input::placeholder {
  color: #ccc;
  font-size: 0.75rem;
}
    @media(max-width:1080px) {
      .preview-row { flex-direction:column; gap:18px; }
      .preview-col { max-width:98vw; }
    }
    @media(max-width:650px) {
      .main-wrapper { width:100vw; }
      .modal-html-preview-box { width:100%; }
      .secret-input-container { bottom: 10px; right: 10px; }
    }
  </style>
</head>
<body>
  <div class="copy-success" id="copySuccess">Copied to clipboard!</div>
  <div class="main-wrapper">
    <div class="preview-row">

      <div class="preview-col" id="col1">
        <div class="card-content">
          <div class="card-live-header">Currently Live</div>
          ${errorMsg}
          <div class="tile-preview-row">
            <div class="tile-preview-label">Tile Preview</div>
            <div class="tile-preview-controls">
              <button id="tileWidthMinus1" class="tile-size-btn">−</button>
              <button id="tileWidthPlus1" class="tile-size-btn">+</button>
              <div class="font-size-control">
                <button id="tileFontMinus1" class="font-size-btn">A-</button>
                <span id="tileFontIndicator1" class="font-size-indicator">100%</span>
                <button id="tileFontPlus1" class="font-size-btn">A+</button>
              </div>
            </div>
          </div>
          <div id="tileHtmlPreview1" class="tile-html-preview-box"></div>
          <div class="light-divider"></div>
          <div class="modal-preview-row">
            <div class="modal-label">Modal Preview</div>
            <div class="modal-preview-controls">
              <button id="modalWidthMinus1" class="modal-size-btn">−</button>
              <button id="modalWidthPlus1" class="modal-size-btn">+</button>
              <button id="modalHeightMinus1" class="modal-size-btn" style="margin-left:12px;">↓</button>
              <button id="modalHeightPlus1" class="modal-size-btn">↑</button>
              <div class="font-size-control">
                <button id="modalFontMinus1" class="font-size-btn">A-</button>
                <span id="modalFontIndicator1" class="font-size-indicator">100%</span>
                <button id="modalFontPlus1" class="font-size-btn">A+</button>
              </div>
            </div>
          </div>
          <div id="modalHtmlPreview1" class="modal-html-preview-box"></div>
        </div>
        <div class="footer-bar" id="footer1">${client}_LiveContent_${tkid3}_${formatDate(lastEdited)}</div>
        <div class="icon-bar">
          <button id="refreshBtn1" class="icon-btn" aria-label="Refresh">
            <i data-lucide="refresh-ccw" style="width:23px;height:23px;"></i>
            <span class="tooltip">Refresh page</span>
          </button>
          <button id="copyTile1" class="icon-btn" aria-label="Copy Tile">
            <i data-lucide="copy" style="width:23px;height:23px;"></i>
            <span class="tooltip">Copy tile as image</span>
          </button>
          <button id="copyModal1" class="icon-btn" aria-label="Copy Modal">
            <i data-lucide="copy" style="width:23px;height:23px;"></i>
            <span class="tooltip">Copy modal as image</span>
          </button>
          <button id="copyCard1" class="icon-btn" aria-label="Copy Full Card">
            <i data-lucide="camera" style="width:23px;height:23px;"></i>
            <span class="tooltip">Copy entire card as image</span>
          </button>
          <button id="download2up" class="icon-btn" aria-label="Download 2-Up">
            <i data-lucide="download" style="width:23px;height:23px;"></i>
            <span class="tooltip">Download both cards as image</span>
          </button>
          <button id="exportHtml1" class="icon-btn" aria-label="Export HTML">
            <i data-lucide="file-code" style="width:23px;height:23px;"></i>
            <span class="tooltip">Export card as HTML file</span>
          </button>
          <button id="saveTileHtml1" class="icon-btn" aria-label="Save Tile HTML">
            <i data-lucide="code" style="width:23px;height:23px;"></i>
            <span class="tooltip">Download tile HTML file</span>
          </button>
          <button id="saveModalHtml1" class="icon-btn" aria-label="Save Modal HTML">
            <i data-lucide="code-2" style="width:23px;height:23px;"></i>
            <span class="tooltip">Download modal HTML file</span>
          </button>
          <button id="copyTileCode1" class="icon-btn tk-branded" aria-label="Copy Tile Code">
            <i data-lucide="clipboard-copy" style="width:23px;height:23px;"></i>
            <span class="tooltip">Copy tile code for AUSTIN</span>
          </button>
          <button id="copyModalCode1" class="icon-btn tk-branded" aria-label="Copy Modal Code">
            <i data-lucide="clipboard-check" style="width:23px;height:23px;"></i>
            <span class="tooltip">Copy modal code for AUSTIN</span>
          </button>
          <button id="homeBtn1" class="icon-btn" aria-label="Home" style="margin-left:auto;">
            <i data-lucide="home" style="width:23px;height:23px;"></i>
            <span class="tooltip">Go to last edited</span>
          </button>
        </div>
      </div>

      <div class="preview-col" id="col2">
        <div class="card-content">
          <div class="card-pending-header">Pending Update</div>
          <div class="tile-preview-row">
            <div class="tile-preview-label">Tile Preview</div>
            <div class="tile-preview-controls">
              <button id="tileWidthMinus2" class="tile-size-btn">−</button>
              <button id="tileWidthPlus2" class="tile-size-btn">+</button>
              <div class="font-size-control">
                <button id="tileFontMinus2" class="font-size-btn">A-</button>
                <span id="tileFontIndicator2" class="font-size-indicator">100%</span>
                <button id="tileFontPlus2" class="font-size-btn">A+</button>
              </div>
            </div>
          </div>
          <div id="tileHtmlPreview2" class="tile-html-preview-box pending"></div>
          <div class="light-divider"></div>
          <div class="modal-preview-row">
            <div class="modal-label">Modal Preview</div>
            <div class="modal-preview-controls">
              <button id="modalWidthMinus2" class="modal-size-btn">−</button>
              <button id="modalWidthPlus2" class="modal-size-btn">+</button>
              <button id="modalHeightMinus2" class="modal-size-btn" style="margin-left:12px;">↓</button>
              <button id="modalHeightPlus2" class="modal-size-btn">↑</button>
              <div class="font-size-control">
                <button id="modalFontMinus2" class="font-size-btn">A-</button>
                <span id="modalFontIndicator2" class="font-size-indicator">100%</span>
                <button id="modalFontPlus2" class="font-size-btn">A+</button>
              </div>
            </div>
          </div>
          <div id="modalHtmlPreview2" class="modal-html-preview-box"></div>
        </div>
        <div class="footer-bar" id="footer2"><i>${client}_BuilderContent_${tkid3}_${formatDate(lastEdited)}</i></div>
        <div class="icon-bar">
          <button id="refreshBtn2" class="icon-btn" aria-label="Refresh">
            <i data-lucide="refresh-ccw" style="width:23px;height:23px;"></i>
            <span class="tooltip">Refresh page</span>
          </button>
          <button id="copyTile2" class="icon-btn" aria-label="Copy Tile">
            <i data-lucide="copy" style="width:23px;height:23px;"></i>
            <span class="tooltip">Copy tile as image</span>
          </button>
          <button id="copyModal2" class="icon-btn" aria-label="Copy Modal">
            <i data-lucide="copy" style="width:23px;height:23px;"></i>
            <span class="tooltip">Copy modal as image</span>
          </button>
          <button id="copyCard2" class="icon-btn" aria-label="Copy Full Card">
            <i data-lucide="camera" style="width:23px;height:23px;"></i>
            <span class="tooltip">Copy entire card as image</span>
          </button>
          <button id="download2up2" class="icon-btn" aria-label="Download 2-Up">
            <i data-lucide="download" style="width:23px;height:23px;"></i>
            <span class="tooltip">Download both cards as image</span>
          </button>
          <button id="exportHtml2" class="icon-btn" aria-label="Export HTML">
            <i data-lucide="file-code" style="width:23px;height:23px;"></i>
            <span class="tooltip">Export card as HTML file</span>
          </button>
          <button id="saveTileHtml2" class="icon-btn" aria-label="Save Tile HTML">
            <i data-lucide="code" style="width:23px;height:23px;"></i>
            <span class="tooltip">Download tile HTML file</span>
          </button>
          <button id="saveModalHtml2" class="icon-btn" aria-label="Save Modal HTML">
            <i data-lucide="code-2" style="width:23px;height:23px;"></i>
            <span class="tooltip">Download modal HTML file</span>
          </button>
          <button id="copyTileCode2" class="icon-btn tk-branded" aria-label="Copy Tile Code">
            <i data-lucide="clipboard-copy" style="width:23px;height:23px;"></i>
            <span class="tooltip">Copy tile code for AUSTIN</span>
          </button>
          <button id="copyModalCode2" class="icon-btn tk-branded" aria-label="Copy Modal Code">
            <i data-lucide="clipboard-check" style="width:23px;height:23px;"></i>
            <span class="tooltip">Copy modal code for AUSTIN</span>
          </button>
          <button id="homeBtn2" class="icon-btn" aria-label="Home" style="margin-left:auto;">
            <i data-lucide="home" style="width:23px;height:23px;"></i>
            <span class="tooltip">Go to last edited</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <div class="secret-input-container">
    <input 
      type="text" 
      id="secretInput" 
      class="secret-input" 
      placeholder="Bloom.1012"
      title="Enter tkid1 value (e.g., Bloom.1012)&#10;&#10;Keyboard shortcuts:&#10;• Tab 3 times&#10;• Ctrl/Cmd + K&#10;• Press 'g' twice"
    >
  </div>

  <script>
    // Inject HTML content safely
    document.getElementById('tileHtmlPreview1').innerHTML  = ${JSON.stringify(liveTile)};
    document.getElementById('modalHtmlPreview1').innerHTML = ${JSON.stringify(liveModal)};
    document.getElementById('tileHtmlPreview2').innerHTML  = ${JSON.stringify(pendingTile)};
    document.getElementById('modalHtmlPreview2').innerHTML = ${JSON.stringify(pendingModal)};

    // Font size state tracking
    let tileFontSizes = { 1: 100, 2: 100 };
    let modalFontSizes = { 1: 100, 2: 100 };

    // Font size control functions
    function updateTileFontSize(num, delta) {
      tileFontSizes[num] = Math.max(50, Math.min(200, tileFontSizes[num] + delta));
      const tile = document.getElementById(\`tileHtmlPreview\${num}\`);
      tile.style.fontSize = \`\${tileFontSizes[num]}%\`;
      document.getElementById(\`tileFontIndicator\${num}\`).textContent = \`\${tileFontSizes[num]}%\`;
    }

    function updateModalFontSize(num, delta) {
      modalFontSizes[num] = Math.max(50, Math.min(200, modalFontSizes[num] + delta));
      const modal = document.getElementById(\`modalHtmlPreview\${num}\`);
      modal.style.fontSize = \`\${modalFontSizes[num]}%\`;
      document.getElementById(\`modalFontIndicator\${num}\`).textContent = \`\${modalFontSizes[num]}%\`;
    }

    // Font size button handlers
    document.getElementById('tileFontPlus1').onclick = () => updateTileFontSize(1, 10);
    document.getElementById('tileFontMinus1').onclick = () => updateTileFontSize(1, -10);
    document.getElementById('tileFontPlus2').onclick = () => updateTileFontSize(2, 10);
    document.getElementById('tileFontMinus2').onclick = () => updateTileFontSize(2, -10);
    
    document.getElementById('modalFontPlus1').onclick = () => updateModalFontSize(1, 10);
    document.getElementById('modalFontMinus1').onclick = () => updateModalFontSize(1, -10);
    document.getElementById('modalFontPlus2').onclick = () => updateModalFontSize(2, 10);
    document.getElementById('modalFontMinus2').onclick = () => updateModalFontSize(2, -10);

    // Secret input handler
    const secretInput = document.getElementById('secretInput');
    secretInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        const value = this.value.trim();
        if (value) {
          window.location.href = '?id=' + encodeURIComponent(value);
        }
      }
    });

    // Check if there's an ID in the URL and populate the input
    const urlParams = new URLSearchParams(window.location.search);
    const currentId = urlParams.get('id');
    if (currentId) {
      secretInput.value = currentId;
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      // Tab 3 times to focus the secret input (track consecutive tabs)
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        window.tabCount = (window.tabCount || 0) + 1;
        
        // Reset tab count after a delay
        clearTimeout(window.tabTimer);
        window.tabTimer = setTimeout(() => {
          window.tabCount = 0;
        }, 1000);
        
        // Focus on 3rd tab
        if (window.tabCount === 3) {
          e.preventDefault();
          secretInput.focus();
          secretInput.select();
          window.tabCount = 0;
        }
      } else {
        // Reset tab count on any other key
        window.tabCount = 0;
      }
      
      // Alternative: Ctrl/Cmd + K (common search shortcut)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        secretInput.focus();
        secretInput.select();
      }
      
      // Alternative: Press 'g' twice quickly (like vim's gg)
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        window.gCount = (window.gCount || 0) + 1;
        
        clearTimeout(window.gTimer);
        window.gTimer = setTimeout(() => {
          window.gCount = 0;
        }, 500);
        
        if (window.gCount === 2) {
          e.preventDefault();
          secretInput.focus();
          secretInput.select();
          window.gCount = 0;
        }
      } else if (e.key !== 'g') {
        window.gCount = 0;
      }
      
      // Escape to go home (last edited)
      if (e.key === 'Escape') {
        e.preventDefault();
        window.location.href = '/';
      }
    });

    // Home button handlers
    document.getElementById('homeBtn1').onclick = 
    document.getElementById('homeBtn2').onclick = () => {
      window.location.href = '/';
    };

    // Size controls with heights
    let [t1, t2] = [360, 360], [m1, m2] = [520, 520], [h1, h2] = [650, 650];
    const T1 = document.getElementById('tileHtmlPreview1');
    const T2 = document.getElementById('tileHtmlPreview2');
    const M1 = document.getElementById('modalHtmlPreview1');
    const M2 = document.getElementById('modalHtmlPreview2');
    
    // Initialize sizes
    T1.style.width = t1 + 'px'; 
    T2.style.width = t2 + 'px';
    M1.style.width = m1 + 'px'; 
    M1.style.height = h1 + 'px';
    M2.style.width = m2 + 'px'; 
    M2.style.height = h2 + 'px';
    
    // Width controls
    document.getElementById('tileWidthPlus1').onclick  = () => { t1 = Math.min(t1 + 40, 600); T1.style.width = t1 + 'px'; };
    document.getElementById('tileWidthMinus1').onclick = () => { t1 = Math.max(t1 - 40, 200); T1.style.width = t1 + 'px'; };
    document.getElementById('modalWidthPlus1').onclick = () => { m1 = Math.min(m1 + 40, 800); M1.style.width = m1 + 'px'; };
    document.getElementById('modalWidthMinus1').onclick = () => { m1 = Math.max(m1 - 40, 320); M1.style.width = m1 + 'px'; };
    document.getElementById('tileWidthPlus2').onclick  = () => { t2 = Math.min(t2 + 40, 600); T2.style.width = t2 + 'px'; };
    document.getElementById('tileWidthMinus2').onclick = () => { t2 = Math.max(t2 - 40, 200); T2.style.width = t2 + 'px'; };
    document.getElementById('modalWidthPlus2').onclick = () => { m2 = Math.min(m2 + 40, 800); M2.style.width = m2 + 'px'; };
    document.getElementById('modalWidthMinus2').onclick = () => { m2 = Math.max(m2 - 40, 320); M2.style.width = m2 + 'px'; };
    
    // Height controls
    document.getElementById('modalHeightPlus1').onclick = () => { h1 = Math.min(h1 + 50, 900); M1.style.height = h1 + 'px'; };
    document.getElementById('modalHeightMinus1').onclick = () => { h1 = Math.max(h1 - 50, 300); M1.style.height = h1 + 'px'; };
    document.getElementById('modalHeightPlus2').onclick = () => { h2 = Math.min(h2 + 50, 900); M2.style.height = h2 + 'px'; };
    document.getElementById('modalHeightMinus2').onclick = () => { h2 = Math.max(h2 - 50, 300); M2.style.height = h2 + 'px'; };

    // Refresh
    document.getElementById('refreshBtn1').onclick = 
    document.getElementById('refreshBtn2').onclick = () => window.location.reload();

    // Show copy success message
    function showCopySuccess() {
      const successMsg = document.getElementById('copySuccess');
      successMsg.classList.add('show');
      setTimeout(() => {
        successMsg.classList.remove('show');
      }, 2000);
    }

    // Capture helpers
    async function waitForImagesLoaded(container) { 
      const imgs = [...container.querySelectorAll('img')];
      await Promise.all(imgs.map(img => 
        img.complete ? Promise.resolve() : new Promise(resolve => {
          img.onload = img.onerror = resolve;
        })
      ));
    }
    
    function hideIconBars(hide) { 
      document.querySelectorAll('.icon-bar')
        .forEach(bar => bar.classList.toggle('hide-for-capture', hide));
    }
    
    async function snap(element, options = {}) {
      return html2canvas(element, {
        useCORS: true,
        backgroundColor: '#fff',
        scale: 2,
        logging: false,
        ...options
      });
    }
    
    async function copySel(selector) {
      try {
        const node = document.querySelector(selector);
        if (!node) throw new Error('Element not found');
        
        await waitForImagesLoaded(node);
        hideIconBars(true);
        const canvas = await snap(node);
        hideIconBars(false);
        
        canvas.toBlob(blob => {
          if (blob) {
            navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]).then(() => {
              showCopySuccess();
            }).catch(err => {
              console.error('Failed to copy to clipboard:', err);
              alert('Failed to copy to clipboard. Please try again.');
            });
          }
        }, 'image/png');
      } catch (err) {
        console.error('Error capturing element:', err);
        alert('Error capturing element. Please try again.');
        hideIconBars(false);
      }
    }
    
    async function dlSel(selector, filename) {
      try {
        const node = document.querySelector(selector);
        if (!node) throw new Error('Element not found');
        
        // If filename not provided, try to get it from the footer
        if (!filename && selector.includes('col')) {
          const footer = node.querySelector('.footer-bar');
          if (footer) {
            filename = footer.innerText.replace(/[<>:"/\\|?*]/g, '_');
          }
        }
        
        await waitForImagesLoaded(node);
        hideIconBars(true);
        const canvas = await snap(node);
        hideIconBars(false);
        
        const link = document.createElement('a');
        link.download = filename + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (err) {
        console.error('Error downloading element:', err);
        alert('Error downloading element. Please try again.');
        hideIconBars(false);
      }
    }
    
    // Copy handlers
    document.getElementById('copyTile1').onclick  = () => copySel('#tileHtmlPreview1');
    document.getElementById('copyModal1').onclick = () => copySel('#modalHtmlPreview1');
    document.getElementById('copyCard1').onclick  = () => copySel('#col1');
    document.getElementById('copyTile2').onclick  = () => copySel('#tileHtmlPreview2');
    document.getElementById('copyModal2').onclick = () => copySel('#modalHtmlPreview2');
    document.getElementById('copyCard2').onclick  = () => copySel('#col2');
    
    // Download handlers
    document.getElementById('download2up').onclick = 
    document.getElementById('download2up2').onclick = () => {
      const footer1 = document.getElementById('footer1').innerText.replace(/[<>:"/\\|?*]/g, '_');
      const footer2 = document.getElementById('footer2').innerText.replace(/[<>:"/\\|?*]/g, '_');
      dlSel('.preview-row', \`\${footer1}_AND_\${footer2}\`);
    };

    // Export HTML
    function exportHtmlCard(cardSelector, label) {
      try {
        const card = document.querySelector(cardSelector);
        if (!card) throw new Error('Card element not found');
        
        const footer = card.querySelector('.footer-bar')?.innerText || '';
        const headerClass = card.querySelector('.card-live-header') ? 'card-live-header' : 'card-pending-header';
        const headerText = card.querySelector('.' + headerClass)?.innerText || label;
        const tileContent = card.querySelector('.tile-html-preview-box')?.innerHTML || '';
        const modalContent = card.querySelector('.modal-html-preview-box')?.innerHTML || '';
        const filename = footer.replace(/[<>:"/\\|?*]/g, '_') || label.replace(/\s+/g, '_');
        const isPending = headerClass === 'card-pending-header';
        
        const html = \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>\${label}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://info.tripkicks.com/hubfs/system/mockup/tk-css.css" rel="stylesheet">
  <style>
    body { 
      margin: 0; 
      background: #f4f9ff; 
      font-family: system-ui;
      padding: 2em 0;
    }
    .wrapper {
      margin: 0 auto; 
      width: 90%; 
      max-width: 620px;
      background: #f6f9fc; 
      border-radius: 18px; 
      border: 1.5px solid #fff;
      box-shadow: 0 16px 48px rgba(36,40,70,0.15), 0 4px 22px rgba(36,40,70,0.09);
      overflow: hidden;
    }
    .footer-bar {
      padding: 8px 0 13px 22px; font-size: .98em; color: #7ca0d7;
      letter-spacing: .03em; font-weight: 500; opacity: .96;
      user-select: all; border-radius: 0 0 18px 18px;
      font-family: 'Menlo','Consolas','monospace',system-ui;
      background: #f6f9fc;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card-header-section">\${headerText}</div>
    
    <div class="content-section">
      <div class="preview-label">Tile Preview</div>
      <div class="tile-container">\${tileContent}</div>
      
      <div class="divider-section">
        <div class="divider-line"></div>
        <div class="divider-logo"></div>
      </div>
      
      <div class="preview-label">Modal Preview</div>
      <div class="modal-container">\${modalContent}</div>
    </div>
    
    <div class="footer-section">\${footer}</div>
  </div>
</body>
</html>\`;
        
        const blob = new Blob([html], { type: 'text/html' });
        const link = document.createElement('a');
        link.download = filename + '.html';
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      } catch (err) {
        console.error('Error exporting HTML:', err);
        alert('Error exporting HTML. Please try again.');
      }
    }
    
    document.getElementById('exportHtml1').onclick = () => exportHtmlCard('#col1', 'Currently Live');
    document.getElementById('exportHtml2').onclick = () => exportHtmlCard('#col2', 'Pending Update');

    // Save individual HTML content
    function saveHtmlContent(elementId, filename, cardId) {
      try {
        const element = document.getElementById(elementId);
        if (!element) throw new Error('Element not found');
        
        // Get footer text for filename
        const footer = document.getElementById(cardId).innerText.replace(/[<>:"/\\|?*]/g, '_');
        const filePrefix = elementId.includes('tile') ? 'tile' : 'modal';
        const finalFilename = \`\${footer}_\${filePrefix}\`;
        
        const htmlContent = element.innerHTML;
        const fullHtml = \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>\${finalFilename}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://info.tripkicks.com/hubfs/system/mockup/tk-css.css" rel="stylesheet">
  <style>
    body { 
      margin: 0; 
      padding: 20px; 
      background: #f4f9ff; 
      font-family: system-ui;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .content-wrapper {
      \${elementId.includes('tile') ? 
        'background: #156eff; color: #fff; border-radius: 12px; padding: 0.25em 0.5em; min-height: 40px; width: fit-content; max-width: 600px;' : 
        'background: #fff; color: #1a1a1a; border: 1.5px solid #eaf0fc; border-radius: 7px; box-shadow: 0 6px 32px rgba(36,40,70,0.15); padding: 0.5em 1em; width: 100%; max-width: 800px; min-height: 300px;'
      }
    }
  </style>
</head>
<body>
  <div class="content-wrapper">
    \${htmlContent}
  </div>
</body>
</html>\`;
        
        const blob = new Blob([fullHtml], { type: 'text/html' });
        const link = document.createElement('a');
        link.download = finalFilename + '.html';
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      } catch (err) {
        console.error('Error saving HTML:', err);
        alert('Error saving HTML. Please try again.');
      }
    }
    
    // Save Tile HTML handlers
    document.getElementById('saveTileHtml1').onclick = () => saveHtmlContent('tileHtmlPreview1', 'tile-live', 'footer1');
    document.getElementById('saveTileHtml2').onclick = () => saveHtmlContent('tileHtmlPreview2', 'tile-pending', 'footer2');
    
    // Save Modal HTML handlers
    document.getElementById('saveModalHtml1').onclick = () => saveHtmlContent('modalHtmlPreview1', 'modal-live', 'footer1');
    document.getElementById('saveModalHtml2').onclick = () => saveHtmlContent('modalHtmlPreview2', 'modal-pending', 'footer2');

    // Copy HTML code to clipboard (just the body content)
    async function copyHtmlCode(elementId) {
      try {
        const element = document.getElementById(elementId);
        if (!element) throw new Error('Element not found');
        
        const htmlContent = element.innerHTML;
        await navigator.clipboard.writeText(htmlContent);
        showCopySuccess();
      } catch (err) {
        console.error('Error copying HTML:', err);
        alert('Failed to copy HTML code. Please try again.');
      }
    }
    
    // Copy HTML code handlers
    document.getElementById('copyTileCode1').onclick = () => copyHtmlCode('tileHtmlPreview1');
    document.getElementById('copyTileCode2').onclick = () => copyHtmlCode('tileHtmlPreview2');
    document.getElementById('copyModalCode1').onclick = () => copyHtmlCode('modalHtmlPreview1');
    document.getElementById('copyModalCode2').onclick = () => copyHtmlCode('modalHtmlPreview2');

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    } else {
      console.error('Lucide library not loaded');
    }
  </script>
</body>
</html>`);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).send('Something went wrong!');
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});