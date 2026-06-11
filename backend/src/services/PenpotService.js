'use strict';

/**
 * PenpotService
 * =============
 * Two modes:
 *  1. PENPOT_ENABLED=true  → calls real Penpot API to create a design file
 *  2. PENPOT_ENABLED=false → generateSvgPreview() renders a static SVG file
 *     saved to public/ux-previews/{taskId}.svg, served via /ux-previews/
 *
 * Penpot API: POST <base>/api/rpc/command/<method>
 * Auth header: Authorization: Token <personal-access-token>
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const nodePath = require('path');

const UX_PREVIEW_DIR = nodePath.resolve(__dirname, '../../../public/ux-previews');

const ENABLED = process.env.PENPOT_ENABLED === 'true';
const BASE_URL = (process.env.PENPOT_BASE_URL || 'http://localhost:9001').replace(/\/$/, '');
const TOKEN = process.env.PENPOT_ACCESS_TOKEN || '';
const FIXED_PROJECT_ID = process.env.PENPOT_PROJECT_ID || null;

const MOBILE_W = 390;
const MOBILE_H = 844;
const GAP = 48;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Infer a render type from a plain-text element description (real Claude Code output).
function inferElementType(str) {
  const s = String(str).toLowerCase();
  if (/logo|wordmark/.test(s)) return 'logo';
  if (/spinner|loading indicator|progress/.test(s)) return 'spinner';
  if (/error|alert|banner/.test(s)) return 'error-banner';
  if (/google/.test(s)) return 'button-google';
  if (/sign in|submit|continue|login|primary.*button|button.*primary/.test(s)) return 'button-primary';
  if (/button|cta|action/.test(s)) return 'button-secondary';
  if (/input|field|email|password|text box/.test(s)) return 'input';
  if (/divider|separator|or/.test(s)) return 'divider';
  if (/link|forgot|create account/.test(s)) return 'link';
  if (/image|illustration|avatar|photo/.test(s)) return 'image-placeholder';
  if (/headline|heading|title|welcome/.test(s)) return 'heading';
  if (/subhead|subtitle|description|caption/.test(s)) return 'subheading';
  return 'text';
}

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function rpc(method, params = {}) {
  const res = await axios.post(
    `${BASE_URL}/api/rpc/command/${method}`,
    params,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${TOKEN}`,
      },
      timeout: 15000,
    },
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Shape builders
// ---------------------------------------------------------------------------

function makeFrame(id, pageId, name, x, y) {
  return {
    type: 'add-obj',
    id,
    'page-id': pageId,
    'parent-id': pageId,
    obj: {
      id,
      type: 'frame',
      name,
      x,
      y,
      width: MOBILE_W,
      height: MOBILE_H,
      rotation: 0,
      fills: [{ 'fill-color': '#F8FAFC', 'fill-opacity': 1 }],
      strokes: [{ 'stroke-color': '#CBD5E1', 'stroke-opacity': 1, 'stroke-width': 1, 'stroke-alignment': 'inner', 'stroke-type': 'solid' }],
      'clip-content': true,
      'show-content': true,
      'constraints-h': 'left',
      'constraints-v': 'top',
    },
  };
}

function makeRect(id, pageId, parentId, name, x, y, w, h, fillColor) {
  return {
    type: 'add-obj',
    id,
    'page-id': pageId,
    'parent-id': parentId,
    obj: {
      id,
      type: 'rect',
      name,
      x,
      y,
      width: w,
      height: h,
      rotation: 0,
      fills: [{ 'fill-color': fillColor, 'fill-opacity': 1 }],
      strokes: [],
      'constraints-h': 'left-right',
      'constraints-v': 'top',
    },
  };
}

function makeText(id, pageId, parentId, content, x, y, w, h, fontSize = 14, bold = false) {
  return {
    type: 'add-obj',
    id,
    'page-id': pageId,
    'parent-id': parentId,
    obj: {
      id,
      type: 'text',
      name: content.slice(0, 40),
      x,
      y,
      width: w,
      height: h,
      rotation: 0,
      fills: [],
      strokes: [],
      content: {
        type: 'root',
        children: [{
          type: 'paragraph-set',
          children: [{
            type: 'paragraph',
            children: [{
              text: content,
              'font-size': String(fontSize),
              'font-weight': bold ? '700' : '400',
              'fill-color': '#1E293B',
              'fill-opacity': 1,
            }],
          }],
        }],
      },
      'constraints-h': 'left-right',
      'constraints-v': 'top',
    },
  };
}

// ---------------------------------------------------------------------------
// Frame generator — builds changes[] for one screen at x offset
// ---------------------------------------------------------------------------

function buildScreenChanges(pageId, screen, xOffset) {
  const frameId = uuidv4();
  const changes = [makeFrame(frameId, pageId, screen.name, xOffset, 0)];

  // Status bar placeholder
  changes.push(makeRect(uuidv4(), pageId, frameId, 'Status Bar', 0, 0, MOBILE_W, 44, '#1E293B'));
  changes.push(makeText(uuidv4(), pageId, frameId, '9:41 AM', 16, 12, 80, 20, 12, false));

  // App header / nav bar
  changes.push(makeRect(uuidv4(), pageId, frameId, 'Nav Bar', 0, 44, MOBILE_W, 56, '#FFFFFF'));
  changes.push(makeText(uuidv4(), pageId, frameId, screen.name, 16, 56, MOBILE_W - 32, 28, 18, true));

  // Content area — one block per element, max 8
  const elements = (screen.elements || []).slice(0, 8);
  let cy = 120;
  for (const el of elements) {
    const label = typeof el === 'string' ? el : (el.name || el.type || 'Element');
    changes.push(makeRect(uuidv4(), pageId, frameId, label, 16, cy, MOBILE_W - 32, 48, '#F1F5F9'));
    changes.push(makeText(uuidv4(), pageId, frameId, label, 24, cy + 14, MOBILE_W - 64, 20, 13, false));
    cy += 64;
    if (cy + 64 > MOBILE_H - 80) break;
  }

  // Purpose label at bottom
  const purpose = typeof screen.purpose === 'string' ? screen.purpose.slice(0, 80) : '';
  if (purpose) {
    changes.push(makeText(uuidv4(), pageId, frameId, purpose, 16, MOBILE_H - 72, MOBILE_W - 32, 56, 11, false));
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Project resolver — find or create the AIFA Designs project
// ---------------------------------------------------------------------------

async function resolveProjectId() {
  if (FIXED_PROJECT_ID) return FIXED_PROJECT_ID;
  const teams = await rpc('get-teams');
  const defaultTeam = teams.find((t) => t['is-default']) || teams[0];
  if (!defaultTeam) throw new Error('No Penpot team found for this token');

  const projects = await rpc('get-projects', { 'team-id': defaultTeam.id });
  const existing = projects.find((p) => p.name === 'AIFA Designs');
  if (existing) return existing.id;

  const created = await rpc('create-project', { 'team-id': defaultTeam.id, name: 'AIFA Designs' });
  return created.id;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

class PenpotService {
  get enabled() { return ENABLED; }

  /**
   * Create a Penpot file with one frame per screen.
   *
   * @param {string} featureName - Feature/PR title (becomes file name)
   * @param {Array}  screens     - UX agent screens: [{name, purpose, elements[], states[]}]
   * @returns {{ url: string|null, editUrl: string|null, fileId: string|null, mock: boolean }}
   */
  async createDesign(featureName, screens = []) {
    if (!ENABLED) {
      return { url: null, editUrl: null, fileId: null, mock: true };
    }
    if (!TOKEN) {
      console.warn('[Penpot] PENPOT_ACCESS_TOKEN not set — skipping design creation');
      return { url: null, editUrl: null, fileId: null, mock: true };
    }

    const projectId = await resolveProjectId();

    const file = await rpc('create-file', {
      name: featureName || 'AIFA UX Design',
      'project-id': projectId,
      'is-shared': false,
    });

    const fileId = file.id;
    const pageId = Object.keys(file.data.pages)[0] || file.data.pages[0];

    // Build all shape changes
    const allChanges = [];
    let xOffset = 0;
    for (const screen of screens) {
      allChanges.push(...buildScreenChanges(pageId, screen, xOffset));
      xOffset += MOBILE_W + GAP;
    }

    if (allChanges.length > 0) {
      await rpc('update-file', {
        id: fileId,
        'session-id': uuidv4(),
        revn: 0,
        changes: allChanges,
      });
    }

    const editUrl = `${BASE_URL}/design/${fileId}/${pageId}`;
    const viewUrl = `${BASE_URL}/view/${fileId}/${pageId}`;

    console.log(`[Penpot] Created design file: ${editUrl}`);
    return { url: viewUrl, editUrl, fileId, mock: false };
  }

  /**
   * Render a visual SVG wireframe from UX agent ingredients and save it to
   * public/ux-previews/{taskId}.svg. Returns the HTTP path to that file.
   *
   * @param {string} taskId
   * @param {Array}  screens      - [{name, purpose, elements:[{type,label,placeholder?}]}]
   * @param {object} colorPalette - brand colors from UX agent output
   * @param {object} typography   - font spec from UX agent output
   * @returns {string} URL path, e.g. "/ux-previews/abc123.svg"
   */
  generateSvgPreview(taskId, screens = [], colorPalette = {}, typography = {}) {
    const pal = {
      primary: '#4285F4', primary_text: '#FFFFFF',
      background: '#F8FAFC', surface: '#FFFFFF',
      border: '#E2E8F0', text: '#1E293B', text_muted: '#64748B',
      error: '#DC2626', success: '#16A34A',
      ...colorPalette,
    };
    const typo = {
      heading_font: 'Inter', body_font: 'Inter',
      heading_size: 22, subheading_size: 14, body_size: 14, small_size: 12,
      ...typography,
    };
    const font = `${typo.body_font}, Arial, sans-serif`;

    const CARD_W = 360;
    const CARD_H = 660;
    const HPAD = 28;
    const GAP_X = 48;
    const OUTER_PAD = 32;
    const TITLE_H = 48;

    const count = screens.length || 1;
    const totalW = count * (CARD_W + GAP_X) - GAP_X + OUTER_PAD * 2;
    const totalH = CARD_H + OUTER_PAD * 2 + TITLE_H;

    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`);
    out.push(`<rect width="${totalW}" height="${totalH}" fill="${pal.background}"/>`);
    out.push(`<text x="${OUTER_PAD}" y="34" font-family="${font}" font-size="17" font-weight="700" fill="${pal.text}">UX Preview — Generated by AIFA</text>`);

    (screens.length ? screens : [{ name: 'Preview', purpose: '', elements: [] }]).forEach((screen, idx) => {
      const cardX = OUTER_PAD + idx * (CARD_W + GAP_X);
      const cardY = TITLE_H + OUTER_PAD;

      // Shadow
      out.push(`<rect x="${cardX + 3}" y="${cardY + 3}" width="${CARD_W}" height="${CARD_H}" rx="16" fill="${pal.border}" opacity="0.6"/>`);
      // Card
      out.push(`<rect x="${cardX}" y="${cardY}" width="${CARD_W}" height="${CARD_H}" rx="16" fill="${pal.surface}" stroke="${pal.border}" stroke-width="1"/>`);

      // Status bar (dark strip at top with rounded top corners)
      out.push(`<rect x="${cardX}" y="${cardY}" width="${CARD_W}" height="32" rx="16" fill="${pal.text}"/>`);
      out.push(`<rect x="${cardX}" y="${cardY + 16}" width="${CARD_W}" height="16" fill="${pal.text}"/>`);
      out.push(`<text x="${cardX + 14}" y="${cardY + 21}" font-family="${font}" font-size="11" fill="white">9:41</text>`);
      out.push(`<text x="${cardX + CARD_W - 14}" y="${cardY + 21}" font-family="${font}" font-size="11" fill="white" text-anchor="end">WiFi ●</text>`);

      // Screen name
      out.push(`<text x="${cardX + HPAD}" y="${cardY + 58}" font-family="${font}" font-size="15" font-weight="700" fill="${pal.text}">${escapeXml(screen.name || '')}</text>`);
      out.push(`<line x1="${cardX + HPAD}" y1="${cardY + 66}" x2="${cardX + CARD_W - HPAD}" y2="${cardY + 66}" stroke="${pal.border}" stroke-width="1"/>`);

      // Elements
      let ey = cardY + 80;
      const elems = Array.isArray(screen.elements) ? screen.elements : [];
      for (const el of elems) {
        // Handle both typed objects {type, label} and plain strings from real Claude Code
        const isStr = typeof el === 'string';
        const rawLabel = isStr ? el : ((el && el.label) || '');
        const type = isStr ? inferElementType(el) : ((el && el.type) || 'text');
        const label = escapeXml(rawLabel);
        const placeholder = escapeXml((!isStr && el && el.placeholder) || '');
        const elW = CARD_W - HPAD * 2;
        const elX = cardX + HPAD;

        if (ey + 56 > cardY + CARD_H - 16) break;

        switch (type) {
          case 'logo':
            out.push(`<circle cx="${elX + 20}" cy="${ey + 18}" r="18" fill="${pal.primary}"/>`);
            out.push(`<text x="${elX + 20}" y="${ey + 24}" font-family="${font}" font-size="15" font-weight="700" fill="white" text-anchor="middle">${escapeXml(rawLabel.charAt(0).toUpperCase())}</text>`);
            out.push(`<text x="${elX + 48}" y="${ey + 24}" font-family="${font}" font-size="18" font-weight="700" fill="${pal.text}">${label}</text>`);
            ey += 48;
            break;

          case 'heading':
            out.push(`<text x="${elX}" y="${ey + 26}" font-family="${font}" font-size="${typo.heading_size}" font-weight="700" fill="${pal.text}">${label}</text>`);
            ey += 40;
            break;

          case 'subheading':
            out.push(`<text x="${elX}" y="${ey + 18}" font-family="${font}" font-size="${typo.subheading_size}" fill="${pal.text_muted}">${label}</text>`);
            ey += 28;
            break;

          case 'button-primary':
            out.push(`<rect x="${elX}" y="${ey}" width="${elW}" height="44" rx="8" fill="${pal.primary}"/>`);
            out.push(`<text x="${elX + elW / 2}" y="${ey + 27}" font-family="${font}" font-size="14" font-weight="600" fill="${pal.primary_text}" text-anchor="middle">${label}</text>`);
            ey += 56;
            break;

          case 'button-secondary':
            out.push(`<rect x="${elX}" y="${ey}" width="${elW}" height="44" rx="8" fill="none" stroke="${pal.primary}" stroke-width="1.5"/>`);
            out.push(`<text x="${elX + elW / 2}" y="${ey + 27}" font-family="${font}" font-size="14" font-weight="600" fill="${pal.primary}" text-anchor="middle">${label}</text>`);
            ey += 56;
            break;

          case 'button-google': {
            out.push(`<rect x="${elX}" y="${ey}" width="${elW}" height="44" rx="8" fill="white" stroke="${pal.border}" stroke-width="1.5"/>`);
            const gcx = elX + 22;
            const gcy = ey + 22;
            out.push(`<circle cx="${gcx}" cy="${gcy}" r="11" fill="#4285F4"/>`);
            out.push(`<text x="${gcx}" y="${gcy + 5}" font-family="${font}" font-size="12" font-weight="700" fill="white" text-anchor="middle">G</text>`);
            out.push(`<text x="${elX + elW / 2 + 10}" y="${ey + 27}" font-family="${font}" font-size="14" font-weight="500" fill="${pal.text}" text-anchor="middle">${label}</text>`);
            ey += 56;
            break;
          }

          case 'input':
            out.push(`<text x="${elX}" y="${ey + 13}" font-family="${font}" font-size="12" font-weight="500" fill="${pal.text_muted}">${label}</text>`);
            out.push(`<rect x="${elX}" y="${ey + 18}" width="${elW}" height="40" rx="6" fill="white" stroke="${pal.border}" stroke-width="1.5"/>`);
            if (placeholder) {
              out.push(`<text x="${elX + 12}" y="${ey + 43}" font-family="${font}" font-size="13" fill="${pal.border}">${placeholder}</text>`);
            }
            ey += 70;
            break;

          case 'divider':
            out.push(`<line x1="${elX}" y1="${ey + 12}" x2="${elX + elW / 2 - 20}" y2="${ey + 12}" stroke="${pal.border}" stroke-width="1"/>`);
            out.push(`<text x="${elX + elW / 2}" y="${ey + 17}" font-family="${font}" font-size="12" fill="${pal.text_muted}" text-anchor="middle">${label || 'or'}</text>`);
            out.push(`<line x1="${elX + elW / 2 + 20}" y1="${ey + 12}" x2="${elX + elW}" y2="${ey + 12}" stroke="${pal.border}" stroke-width="1"/>`);
            ey += 32;
            break;

          case 'link':
            out.push(`<text x="${elX + elW / 2}" y="${ey + 16}" font-family="${font}" font-size="13" fill="${pal.primary}" text-anchor="middle" text-decoration="underline">${label}</text>`);
            ey += 28;
            break;

          case 'error-banner':
            out.push(`<rect x="${elX}" y="${ey}" width="${elW}" height="44" rx="6" fill="#FEE2E2"/>`);
            out.push(`<rect x="${elX}" y="${ey}" width="4" height="44" rx="2" fill="${pal.error}"/>`);
            out.push(`<text x="${elX + 16}" y="${ey + 27}" font-family="${font}" font-size="13" fill="${pal.error}">${label}</text>`);
            ey += 56;
            break;

          case 'spinner':
            out.push(`<circle cx="${elX + elW / 2}" cy="${ey + 22}" r="16" fill="none" stroke="${pal.border}" stroke-width="3"/>`);
            out.push(`<path d="M ${elX + elW / 2} ${ey + 6} A 16 16 0 0 1 ${elX + elW / 2 + 16} ${ey + 22}" fill="none" stroke="${pal.primary}" stroke-width="3" stroke-linecap="round"/>`);
            ey += 52;
            break;

          case 'image-placeholder':
            out.push(`<rect x="${elX}" y="${ey}" width="${elW}" height="80" rx="8" fill="${pal.background}" stroke="${pal.border}" stroke-width="1" stroke-dasharray="4 4"/>`);
            out.push(`<text x="${elX + elW / 2}" y="${ey + 45}" font-family="${font}" font-size="12" fill="${pal.text_muted}" text-anchor="middle">[ ${label || 'image'} ]</text>`);
            ey += 92;
            break;

          default:
            out.push(`<rect x="${elX}" y="${ey}" width="${elW}" height="36" rx="6" fill="${pal.background}" stroke="${pal.border}" stroke-width="1"/>`);
            out.push(`<text x="${elX + 12}" y="${ey + 22}" font-family="${font}" font-size="12" fill="${pal.text_muted}">${label || type}</text>`);
            ey += 48;
        }

        ey += 4; // gap between elements
      }

      // Purpose footnote at bottom of card
      if (screen.purpose) {
        const purposeText = String(screen.purpose).slice(0, 90);
        out.push(`<text x="${cardX + HPAD}" y="${cardY + CARD_H - 18}" font-family="${font}" font-size="10" fill="${pal.text_muted}">${escapeXml(purposeText)}</text>`);
      }
    });

    out.push('</svg>');

    // Ensure output dir exists and write file
    if (!fs.existsSync(UX_PREVIEW_DIR)) {
      fs.mkdirSync(UX_PREVIEW_DIR, { recursive: true });
    }
    const fileName = `${taskId}.svg`;
    fs.writeFileSync(nodePath.join(UX_PREVIEW_DIR, fileName), out.join('\n'), 'utf8');
    console.log(`[UX Preview] Saved wireframe to public/ux-previews/${fileName}`);
    return `/ux-previews/${fileName}`;
  }

  /**
   * Verify connectivity and token validity.
   * @returns {{ ok: boolean, error?: string }}
   */
  async healthCheck() {
    if (!ENABLED) return { ok: false, error: 'PENPOT_ENABLED is false' };
    try {
      await rpc('get-profile');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

module.exports = new PenpotService();
module.exports.PenpotService = PenpotService;
