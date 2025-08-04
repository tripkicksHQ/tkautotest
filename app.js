// @ts-nocheck
require('dotenv').config();
const express = require('express');
const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const app = express();
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PORT = process.env.PORT || 3000;

function formatDate(dt) {
  if (!dt) return '';
  const pad = n => String(n).padStart(2, '0');
  const d = new Date(dt);
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${String(d.getFullYear()).slice(-2)}_${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function extractHtml(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'rich_text': return prop.rich_text.map(rt => rt.plain_text).join('');
    case 'title': return prop.title.map(rt => rt.plain_text).join('');
    case 'formula': return prop.formula.string || '';
    case 'plain_text': return prop.plain_text || '';
    default: return '';
  }
}

function extractText(prop) {
  if (!prop) return '';
  if (prop.type === 'title' && prop.title.length) return prop.title.map(t => t.plain_text).join('');
  if (prop.type === 'rich_text' && prop.rich_text.length) return prop.rich_text.map(t => t.plain_text).join('');
  if (prop.type === 'formula') {
    if (prop.formula.type === 'string' && prop.formula.string !== null) return prop.formula.string;
    if (prop.formula.type === 'number' && prop.formula.number !== null) return String(prop.formula.number);
  }
  if (typeof prop.plain_text === 'string') return prop.plain_text;
  return '';
}

function sanitizeHtml(html) {
  if (!html) return '';
  return html.replace(/javascript:/gi, '').replace(/on\w+\s*=/gi, '');
}

app.get('/', async (req, res) => {
  try {
    let page;
    const requestedId = req.query.id;

    if (requestedId) {
      const searchResults = await notion.databases.query({
        database_id: process.env.DATABASE_ID,
        filter: { property: 'tkid1', formula: { string: { equals: requestedId } } }
      });
      if (searchResults.results.length > 0) page = searchResults.results[0];
    } else {
      const db = await notion.databases.query({
        database_id: process.env.DATABASE_ID,
        page_size: 1,
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
      });
      if (db.results.length > 0) page = db.results[0];
    }

    let liveTile = '<div style="padding:0.5em;color:#fff;background:#156eff;">No HTML found in <b>Tile HTML</b>.</div>';
    let liveModal = '<div style="padding:0.5em;color:#222;">No HTML found in <b>Modal HTML</b>.</div>';
    let pendingTile = '<div style="padding:0.5em;">No HTML found in <b>Builder ⓵ TILE</b>.</div>';
    let pendingModal = '<div style="padding:0.5em;color:#222;">No HTML found in <b>Builder ⓵ MODAL</b>.</div>';
    let client = 'Client';
    let tkid3 = 'tkid';
    let lastEdited = '';
    let errorMsg = !page && requestedId ? `<div style="color:#c00; padding:1em;">No record found for ID: ${requestedId}</div>` : 
                   !page ? `<div style="color:#c00; padding:1em;">No pages found in database.</div>` : '';

    if (page) {
      tkid3 = extractText(page.properties['TK id']) || 'tkid';
      const tkid1Value = extractText(page.properties['tkid1']) || '';
      client = tkid1Value.includes('.') ? tkid1Value.split('.')[0] : 'Client';
      lastEdited = page.last_edited_time;
      liveTile = sanitizeHtml(extractHtml(page.properties['Tile HTML'])) || liveTile;
      liveModal = sanitizeHtml(extractHtml(page.properties['Modal HTML'])) || liveModal;
      pendingTile = sanitizeHtml(extractHtml(page.properties['Builder ⓵ TILE'])) || pendingTile;
      pendingModal = sanitizeHtml(extractHtml(page.properties['Builder ⓵ MODAL'])) || pendingModal;
    }

    let html = fs.readFileSync(path.join(__dirname, 'preview.html'), 'utf-8');

    html = html.replace('', errorMsg)
               .replace('/*LIVE_TILE_JSON*/ ""', JSON.stringify(liveTile))
               .replace('/*LIVE_MODAL_JSON*/ ""', JSON.stringify(liveModal))
               .replace('/*PENDING_TILE_JSON*/ ""', JSON.stringify(pendingTile))
               .replace('/*PENDING_MODAL_JSON*/ ""', JSON.stringify(pendingModal))
               .replace('', `${client}_LiveContent_${tkid3}_${formatDate(lastEdited)}`)
               .replace('', `<i>${client}_BuilderContent_${tkid3}_${formatDate(lastEdited)}</i>`);

    res.send(html);

  } catch (e) {
    console.error('Server Error:', e);
    res.status(500).send("Error fetching data from Notion. Check server logs.");
  }
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});