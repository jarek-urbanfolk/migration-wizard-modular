import React, { useState, useRef } from 'react';
import {
  Upload, ArrowRight, CheckCircle, FileSpreadsheet, AlertTriangle,
  Users, ShoppingBag, Search, Link as LinkIcon, ShoppingCart, MessageSquareQuote,
  Wand2, Sparkles, Loader2, Globe, Database, LayoutTemplate,
  X, FileBox, Scissors, ChevronDown, ChevronUp, Plus, Server, Key, Play, Info, Cpu,
  Download, AlertCircle, ArrowDownToLine, ShieldAlert, ShieldCheck
} from 'lucide-react';
import { XMLParser } from 'fast-xml-parser';

// --- PROVEN V1 UTILITY: CSV PARSER ---
const parseCSV = (str) => {
  const arr = []; let quote = false; let col = 0, row = 0;
  for (let c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c + 1];
    arr[row] = arr[row] || []; arr[row][col] = arr[row][col] || '';
    if (cc === '"' && quote && nc === '"') { arr[row][col] += cc; ++c; continue; }
    if (cc === '"') { quote = !quote; continue; }
    if (cc === ',' && !quote) { ++col; continue; }
    if (cc === '\r' && nc === '\n' && !quote) { ++row; col = 0; ++c; continue; }
    if (cc === '\n' && !quote) { ++row; col = 0; continue; }
    if (cc === '\r' && !quote) { ++row; col = 0; continue; }
    arr[row][col] += cc;
  }
  return arr;
};

// --- NEW XML PARSER & NORMALIZER ---
const parseAndNormalizeXML = (xmlString) => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    allowBooleanAttributes: true
  });
  
  let jsonObj;
  try {
    jsonObj = parser.parse(xmlString);
  } catch (e) {
    console.error("XML Parsing Error:", e);
    return [];
  }

  // Find the largest array in the JSON to use as rows (auto-detect repeating elements like <item>, <product>)
  let maxArray = [];
  const findLargestArray = (obj) => {
    if (Array.isArray(obj)) {
      if (obj.length > maxArray.length) maxArray = obj;
      obj.forEach(findLargestArray);
    } else if (obj !== null && typeof obj === 'object') {
      Object.values(obj).forEach(findLargestArray);
    }
  };
  findLargestArray(jsonObj);

  if (!maxArray || maxArray.length === 0) {
    // If no array found, try wrapping the root in an array
    maxArray = [jsonObj];
  }

  const flattenedRows = maxArray.map(item => {
    const flat = {};
    const flattenObj = (obj, prefix = '') => {
      if (Array.isArray(obj)) {
        // Handle WordPress wp:postmeta specifically
        if (obj.every(o => o && typeof o === 'object' && ('wp:meta_key' in o))) {
          obj.forEach(meta => {
            if (meta['wp:meta_key']) {
              flat[meta['wp:meta_key']] = meta['wp:meta_value'] !== undefined ? String(meta['wp:meta_value']) : '';
            }
          });
        } else {
          // General arrays: comma-separated string
          const vals = obj.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(', ');
          flat[prefix] = vals;
        }
      } else if (obj !== null && typeof obj === 'object') {
        Object.keys(obj).forEach(key => {
          // Flatten nested objects
          if (key === 'wp:postmeta' && Array.isArray(obj[key])) {
             flattenObj(obj[key], prefix); // Let the array handler deal with it
          } else if (key === 'wp:postmeta' && typeof obj[key] === 'object' && obj[key]['wp:meta_key']) {
             // Handle single wp:postmeta
             flat[obj[key]['wp:meta_key']] = obj[key]['wp:meta_value'] !== undefined ? String(obj[key]['wp:meta_value']) : '';
          } else {
             flattenObj(obj[key], prefix ? `${prefix}_${key}` : key);
          }
        });
      } else {
        flat[prefix] = obj;
      }
    };
    flattenObj(item);
    return flat;
  });

  // Collect all unique headers
  const headersSet = new Set();
  flattenedRows.forEach(row => {
    Object.keys(row).forEach(k => headersSet.add(k));
  });
  const headers = Array.from(headersSet);

  // Return exactly like parseCSV: array of arrays. 
  // First element is headers, subsequent are rows matching header order
  const result = [headers];
  flattenedRows.forEach(rowObj => {
    const rowArr = headers.map(h => rowObj[h] !== undefined && rowObj[h] !== null ? String(rowObj[h]) : '');
    result.push(rowArr);
  });

  return result;
};

const unparseCSV = (data, headers) => {
  if (data.length === 0) return '';
  const rows = data.map(row =>
    headers.map(header => {
      let cell = row[header] === null || row[header] === undefined ? '' : String(row[header]);
      // AGGRESSIVE QUOTING: Wrap if it contains comma, double quote, or any newline/carriage return
      if (/[,\"\n\r]/.test(cell)) {
        cell = `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
};

const slugify = (text) => {
  if (!text) return '';
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

// --- PROVEN V1 UTILITY: TEXT CLEANERS & FORMATTERS ---
const cleanText = (str) => {
  if (!str) return '';
  // AGGRESSIVE SCRUBBING: Strip dangerous HTML, backslashes, and fix formatting
  let text = str
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '') // Hunt down hidden Carriage Returns
    .replace(/\\/g, '') // Strip stray backslashes
    .replace(/>\s*\n\s*</g, '><')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n• ') // Convert list items to plain bullets
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]*>?/gm, ''); // Strip all remaining HTML tags

  return text
    .replace(/([•\-*])\s*\n\s*/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n') // Normalize multiple line breaks
    .trim();
};

const formatBlock = (blockText) => {
  if (!blockText) return '';
  const paragraphs = blockText.split(/\n{2,}/).filter(Boolean);
  let blockHtml = '';

  paragraphs.forEach(p => {
    if (p.match(/(?:^|\n)\s*[•\-*]\s+/)) {
      const items = p.split(/(?:^|\n)\s*[•\-*]\s+/).filter(Boolean);
      blockHtml += `<ul>${items.map(i => `<li>${i.trim().replace(/\n/g, ' ')}</li>`).join('')}</ul>`;
    } else {
      blockHtml += `<p>${p.trim().replace(/\n/g, '<br>')}</p>`;
    }
  });
  return blockHtml;
};

const extractPlainTextForSeo = (str) => {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, ' ').replace(/\\n/g, ' ').replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
};

const extractSectionsToMetafields = (text, sections = []) => {
  if (!text) return { main: '', meta: {} };

  // 1. Pre-process text to normalize headings
  let normalizedText = text
    .replace(/<h[1-6][^>]*>(?:\s*<strong[^>]*>)?\s*(.*?)\s*(?:<\/strong>\s*)?<\/h[1-6]>/gi, '\n\n[H]$1[/H]\n\n')
    .replace(/<p[^>]*>\s*<strong[^>]*>\s*(.*?)\s*<\/strong>\s*<\/p>/gi, '\n\n[H]$1[/H]\n\n')
    .replace(/<strong[^>]*>\s*(.*?)\s*<\/strong>[:\s]*<br\s*\/?>/gi, '\n\n[H]$1[/H]\n\n');

  if (sections.length === 0) return { main: formatBlock(cleanText(normalizedText.replace(/\[\/?H\]/g, ''))), meta: {} };

  const cleanDesc = cleanText(normalizedText);
  const result = { main: '', meta: {} };

  // 2. Build a regex that matches the headings flexibly
  // We strip common punctuation from the heading list to match "Ingredients" even if the UI has "Ingredients:"
  const escaped = sections.map(s => {
    const base = s.heading.replace(/[:\s-]+$/, '').trim();
    return base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });

  // Regex: matches [H]marker, newline, or start of string
  // then the heading text, then optional colons/spaces/dashes, then closing [H] or block ends
  const regex = new RegExp(`(?:\\[H\\]|\\n|^)\\s*(${escaped.join('|')})[:\\s-]*(?:\\[\\/H\\]|[:\\s-]*|\\n|$)`, 'gi');

  const parts = cleanDesc.split(regex);

  // 3. Process the split parts
  if (parts[0] && parts[0].trim()) {
    result.main = formatBlock(parts[0].replace(/\[\/?H\]/g, '').trim());
  }

  for (let i = 1; i < parts.length; i += 2) {
    // Normalize the found heading to match back to our section definition
    let foundHeading = parts[i].trim().replace(/[:\s-]+$/, '').toLowerCase();
    let content = parts[i + 1] ? parts[i + 1].replace(/\[\/?H\]/g, '').trim() : '';

    const sectionDef = sections.find(s => {
      const target = s.heading.trim().replace(/[:\s-]+$/, '').toLowerCase();
      return foundHeading === target;
    });

    if (sectionDef && sectionDef.shopifyMeta) {
      result.meta[sectionDef.shopifyMeta] = content;
    } else {
      // If we matched something but couldn't find the def (shouldn't happen with regex),
      // or if it's unmapped, put it back into main or a temp slot
      if (content) result.main += `\n\n${parts[i]}: ${content}`;
    }
  }

  if (Object.keys(result.meta).length === 0) {
    result.main = formatBlock(cleanText(text));
  } else if (!result.main) {
    // If everything was extracted but main is empty, we need to ensure main isn't just blank
    // (Shopify sometimes requires something in the Body/Description)
    result.main = "<p>Product details available in sections below.</p>";
  }

  return result;
};

const purifyHtml = (html) => {
  if (!html) return '';
  // Strip data-attributes, section-ids, etc. but keep structure
  return html.replace(/\sdata-[a-z0-9-]+="[^"]*"/gi, '')
    .replace(/\sclass="[^"]*"/gi, '')
    .replace(/\sid="[^"]*"/gi, '')
    .replace(/\sstyle="[^"]*"/gi, '')
    .trim();
};

const scoreMapping = (headers, targetType) => {
  const dictionary = {
    vendor: [/brand/i, /manufacturer/i, /vendor/i, /mfr/i, /fb_brand/i, /ps_brand/i],
    seoTitle: [/seo.*title/i, /yoast.*title/i, /meta.*title/i],
    seoDesc: [/seo.*desc/i, /yoast.*desc/i, /meta.*desc/i],
    subtitle: [/subtitle/i, /sub-title/i, /meta:.*subtitle/i],
    shortDesc: [/short.*description/i, /excerpt/i, /brief/i],
    desc: [/description/i, /body/i, /content/i, /desc$/i]
  };
  const matchers = dictionary[targetType] || [];
  const found = headers.find(h => matchers.some(m => m.test(h)));
  return found || '';
};

const filterJunkColumns = (rows, cols) => {
  const junk = []; const active = [];
  cols.forEach(col => {
    const isSystem = col.match(/_edit_lock|_wp_attachment|_version|user_pass/i);
    const emptyCount = rows.filter(r => !r[col] || r[col].toString().trim() === '').length;
    const sparsity = emptyCount / rows.length;

    if (isSystem || sparsity >= 1) junk.push(col);
    else active.push(col);
  });
  return { active, junk };
};

const getVal = (row, header) => {
  if (!row || !header) return '';
  // Aggressively clean the header (handle tabs, newlines, etc.)
  const cleanHeader = header.toString().replace(/[\t\r\n]/g, ' ').trim();

  // 1. Direct hit
  if (row[cleanHeader] !== undefined && row[cleanHeader] !== null) return String(row[cleanHeader]).trim();
  if (row[header] !== undefined && row[header] !== null) return String(row[header]).trim();

  // 2. Case-insensitive & Whitespace/Tab-insensitive fallback
  const keys = Object.keys(row);
  const target = cleanHeader.toLowerCase();
  const foundKey = keys.find(k => k && k.toString().replace(/[\t\r\n]/g, ' ').trim().toLowerCase() === target);

  if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
    return String(row[foundKey]).trim();
  }
  return '';
};

const calculateWeight = (row) => {
  let weight = 0;
  if (row['Weight (kg)']) weight = parseFloat(row['Weight (kg)']) * 1000;
  else if (row['Weight (lbs)']) weight = parseFloat(row['Weight (lbs)']) * 453.592;
  else if (row['Weight (g)']) weight = parseFloat(row['Weight (g)']);
  else if (row['Weight (oz)']) weight = parseFloat(row['Weight (oz)']) * 28.3495;
  return isNaN(weight) || weight === 0 ? '' : weight;
};

const parseSerializedLineItems = (row, fallbackNameCol, fallbackSkuCol, fallbackQtyCol, fallbackPriceCol) => {
  const items = [];
  Object.keys(row).forEach(key => {
    if (key.toLowerCase().startsWith('line_item_') && row[key] && row[key].includes('name:')) {
      const parts = row[key].split('|');
      const itemData = {};
      parts.forEach(p => {
        const firstColon = p.indexOf(':');
        if (firstColon > -1) itemData[p.substring(0, firstColon).trim()] = p.substring(firstColon + 1).trim();
      });
      if (itemData.name) {
        items.push({
          title: itemData.name,
          sku: itemData.sku || '',
          qty: itemData.quantity || '1',
          price: itemData.total || itemData.sub_total || '0.00'
        });
      }
    }
  });

  if (items.length === 0 && fallbackNameCol && row[fallbackNameCol]) {
    items.push({
      title: row[fallbackNameCol] || 'Custom Item',
      sku: row[fallbackSkuCol] || '',
      qty: row[fallbackQtyCol] || '1',
      price: row[fallbackPriceCol] || '0.00'
    });
  }
  if (items.length === 0) items.push({ title: 'Custom Item', sku: '', qty: '1', price: '0.00' });
  return items;
};

// --- Headers & Dictionaries ---
const SHOPIFY_PRODUCT_HEADERS = ['Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags', 'Published on online store', 'Status', 'SKU', 'Option1 name', 'Option1 value', 'Option2 name', 'Option2 value', 'Option3 name', 'Option3 value', 'Price', 'Compare-at price', 'Inventory tracker', 'Inventory quantity', 'Continue selling when out of stock', 'Weight value (grams)', 'Requires shipping', 'Variant Taxable', 'Fulfillment service', 'Product image URL', 'Image position', 'Variant image URL', 'SEO title', 'SEO description'];
const SHOPIFY_CUSTOMER_HEADERS = ['First Name', 'Last Name', 'Email', 'Accepts Email Marketing', 'Default Address Company', 'Default Address Address1', 'Default Address Address2', 'Default Address City', 'Default Address Province Code', 'Default Address Country Code', 'Default Address Zip', 'Default Address Phone', 'Phone', 'Accepts SMS Marketing', 'Tags', 'Note', 'Tax Exempt'];
const MATRIXIFY_ORDER_HEADERS = ['Name', 'Command', 'Customer: Email', 'Payment: Status', 'Fulfillment: Status', 'Created At', 'Tags', 'Note', 'Line: Type', 'Line: Title', 'Line: SKU', 'Line: Quantity', 'Line: Price'];
const REDIRECT_HEADERS = ['Redirect from', 'Redirect to'];
const REVIEW_HEADERS = ['product_handle', 'state', 'rating', 'title', 'author', 'email', 'body', 'created_at'];

const KNOWN_WOO_COLS = {
  products: ['Name', 'SKU', 'Published', 'Tax status', 'Manage stock?', 'Stock', 'Backorders allowed?', 'Sale price', 'Regular price', 'Images', 'Weight (kg)', 'Weight (lbs)', 'Type', 'Parent', 'Short description', 'Description'],
  customers: ['First Name', 'Last Name', 'Email', 'Billing First Name', 'Billing Last Name', 'Billing Company', 'Billing Address 1', 'Billing Address 2', 'Billing City', 'Billing Postcode', 'Billing Country', 'Billing State', 'Billing Phone', 'Billing Email', 'Shipping First Name', 'Shipping Last Name', 'Shipping Address 1', 'Shipping Address 2', 'Shipping City', 'Shipping Postcode', 'Shipping Country', 'Shipping State'],
  orders: ['Order Number', 'Order Status', 'Order Date', 'Customer Billing Email', 'Customer Billing First Name', 'Customer Billing Last Name', 'Order Total', 'Item Name', 'Item SKU', 'Item Quantity', 'Item Cost']
};

export default function App() {
  const [activeFlow, setActiveFlow] = useState('products');
  const [flowStep, setFlowStep] = useState(1);
  const fileInputRef = useRef(null);
  const reviewsInputRef = useRef(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingTestBatch, setIsGeneratingTestBatch] = useState(false);
  const [testBatchData, setTestBatchData] = useState(null);
  const [sampleProductUrl, setSampleProductUrl] = useState('');

  // States
  const [prodData, setProdData] = useState({ raw: null, cols: [], activeCols: [], junkCols: [], final: null, redirects: null, reviews: null, headers: [] });
  const [prodMap, setProdMap] = useState({ core: { vendor: '', categories: '', tags: '', desc: 'Description', shortDesc: 'Short description', subtitle: '', seoTitle: '', seoDesc: '' }, meta: [], extracted: [], strategy: 'extract-metafields', storeVendor: 'My Store', apiKey: '', auditAdvice: [] });
  const [prodReport, setProdReport] = useState(null);

  const [custData, setCustData] = useState({ raw: null, cols: [], final: null, headers: [] });
  const [custMap, setCustMap] = useState({ core: { first: '', last: '', email: '', company: '', addr1: '', addr2: '', city: '', province: '', country: '', zip: '', addrPhone: '', phone: '', emailMarketing: 'no', smsMarketing: 'no', taxExempt: 'no', tags: '', note: '' }, meta: [] });
  const [custReport, setCustReport] = useState(null);

  const [ordData, setOrdData] = useState({ raw: null, cols: [], final: null, headers: [] });
  const [ordMap, setOrdMap] = useState({ core: { id: '', date: '', email: '', status: '', itemName: '', itemSku: '', itemQty: '', itemPrice: '' }, meta: [], mode: 'matrixify' });
  const [ordReport, setOrdReport] = useState(null);
  const [syncProgress, setSyncProgress] = useState({ active: false, current: 0, total: 0, complete: false });

  const [rejectedSearch, setRejectedSearch] = useState('');
  const [showRejected, setShowRejected] = useState(false);

  // --- Handlers ---
  const switchFlow = (flow) => { setActiveFlow(flow); setFlowStep(1); setRejectedSearch(''); setShowRejected(false); };
  const nextStep = () => setFlowStep(p => p + 1);
  const prevStep = () => setFlowStep(p => p - 1);

  const handleFileUpload = (e, flowContext) => {
    const file = e.target.files[0]; if (!file) return;
    setIsProcessing(true);
    const isXML = file.name.toLowerCase().endsWith('.xml');
    const reader = new FileReader();
    reader.onload = (event) => {
      let parsed = [];
      if (isXML) {
        parsed = parseAndNormalizeXML(event.target.result);
      } else {
        parsed = parseCSV(event.target.result);
      }
      if (!parsed || parsed.length === 0 || !parsed[0]) {
        setIsProcessing(false);
        alert(`Empty or malformed ${isXML ? 'XML' : 'CSV'} file.`);
        return;
      }
      const headers = parsed[0].map(h => (h || '').toString().replace(/[\t\r\n]/g, ' ').trim());
      const rows = parsed.slice(1).map(r => {
        const obj = {}; headers.forEach((h, i) => { obj[h] = r[i]; }); return obj;
      });
      // --- GLOBAL: CALCULATE DATA DENSITY (POPULATION %) ---
      const colStats = {};
      headers.forEach(col => {
        const filled = rows.filter(r => (r[col] || '').toString().trim() !== '').length;
        colStats[col] = Math.round((filled / rows.length) * 100);
      });

      if (flowContext === 'products') {
        const { active, junk } = filterJunkColumns(rows, headers);
        const coreMappings = {
          vendor: scoreMapping(headers, 'vendor'),
          seoTitle: scoreMapping(headers, 'seoTitle'),
          seoDesc: scoreMapping(headers, 'seoDesc'),
          subtitle: scoreMapping(headers, 'subtitle'),
          shortDesc: scoreMapping(headers, 'shortDesc'),
          desc: scoreMapping(headers, 'desc') || 'Description',
          categories: headers.find(h => h.toLowerCase() === 'categories') || 'Categories',
          tags: headers.find(h => h.toLowerCase() === 'tags') || 'Tags'
        };

        setProdData(p => ({ ...p, raw: rows, cols: headers, activeCols: active, junkCols: junk, colStats }));
        const discovered = runHeuristicDiscovery(rows, headers, 'products');
        setProdMap(p => ({ ...p, core: coreMappings, meta: discovered.meta, extracted: discovered.extracted }));
      } else if (flowContext === 'customers') {
        setCustData(p => ({ ...p, raw: rows, cols: headers, colStats }));
        const discovered = runHeuristicDiscovery(rows, headers, 'customers');
        setCustMap(p => ({ ...p, core: { ...p.core, ...discovered.core }, meta: discovered.meta }));
      } else if (flowContext === 'orders') {
        setOrdData(p => ({ ...p, raw: rows, cols: headers, colStats }));
        const discovered = runHeuristicDiscovery(rows, headers, 'orders');
        setOrdMap(p => ({ ...p, core: { ...p.core, ...discovered.core }, meta: discovered.meta }));
      }
      setIsProcessing(false); nextStep();
    };
    reader.readAsText(file); e.target.value = '';
  };

  const triggerDownload = (data, headers, filename) => {
    if (!data || data.length === 0) return;
    const csvStr = unparseCSV(data, headers);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const triggerChunkedDownload = (data, headers, baseFilename) => {
    if (!data || data.length === 0) return;
    const csvStr = unparseCSV(data, headers);
    const MAX_BYTES = 14.5 * 1024 * 1024;
    const blob = new Blob([csvStr]);
    if (blob.size <= MAX_BYTES) {
      triggerDownload(data, headers, `${baseFilename}.csv`);
      return;
    }
    const avgRowSize = blob.size / data.length;
    const rowsPerChunk = Math.floor(MAX_BYTES / avgRowSize) - 100;
    let chunkIndex = 1;
    for (let i = 0; i < data.length; i += rowsPerChunk) {
      triggerDownload(data.slice(i, i + rowsPerChunk), headers, `${baseFilename}_part${chunkIndex}.csv`);
      chunkIndex++;
    }
  };

  const downloadSchemaCSV = (flowType) => {
    const headers = ['Source Column', 'Shopify Name', 'Shopify Key', 'Suggested Type'];
    const data = [];
    const metaList = flowType === 'products' ? prodMap.meta : flowType === 'customers' ? custMap.meta : ordMap.meta;
    metaList.forEach(m => data.push({
      'Source Column': m.wooCol,
      'Shopify Name': m.name || m.wooCol,
      'Shopify Key': m.shopifyMeta,
      'Suggested Type': m.type || (m.wooCol.toLowerCase().match(/description|content|body/) ? 'multi_line_text_field' : 'single_line_text_field')
    }));
    if (flowType === 'products' && prodMap.strategy === 'extract-metafields') {
      prodMap.extracted.forEach(sec => data.push({
        'Source Column': `Extracted: ${sec.heading}`,
        'Shopify Name': sec.heading.replace(/[:\-]/g, '').trim(),
        'Shopify Key': sec.shopifyMeta,
        'Suggested Type': 'multi_line_text_field'
      }));
    }
    triggerDownload(data, headers, `shopify_${flowType}_schema.csv`);
  };

  const WOO_DICTIONARY = {
    '_edit_lock': 'System: Edit Lock',
    '_edit_last': 'System: Last Edited By',
    '_wp_old_slug': 'SEO: Previous URL Slug',
    '_yoast_wpseo_title': 'SEO: Yoast Title',
    '_yoast_wpseo_metadesc': 'SEO: Yoast Description',
    '_yoast_wpseo_focuskw': 'SEO: Focus Keyword',
    '_yoast_wpseo_primary_category': 'Category: Primary',
    '_product_attributes': 'System: Raw Attributes',
    '_price': 'Price: Internal',
    '_regular_price': 'Price: Regular',
    '_sale_price': 'Price: Sale',
    '_sku': 'SKU: Internal',
    '_stock': 'Stock: Internal',
    '_stock_status': 'Stock: Status',
    '_visibility': 'Visibility: System',
    '_downloadable': 'Product: Downloadable',
    '_virtual': 'Product: Virtual',
    '_weight': 'Weight: Internal',
    '_length': 'Length: Internal',
    '_width': 'Width: Internal',
    '_height': 'Height: Internal',
    '_manage_stock': 'Stock: Managed?',
    '_backorders': 'Stock: Backorders?',
    '_tax_status': 'Tax: Status',
    '_tax_class': 'Tax: Class',
    '_purchase_note': 'Purchase: Note',
    '_low_stock_amount': 'Stock: Low Threshold'
  };

  const generateCleanMetaName = (rawCol) => {
    if (WOO_DICTIONARY[rawCol]) return WOO_DICTIONARY[rawCol];

    let clean = rawCol.replace(/^(Meta|Attribute|_wc_|_wp_|_yoast_|_yith_)/i, '').replace(/value\(s\)/i, '').replace(/[_]/g, ' ').trim();
    if (!clean || clean.length <= 2) clean = rawCol.replace(/[_]/g, ' ').trim();

    if (rawCol.match(/^(user_pass|user_login|user_email|user_url|user_activation_key|user_status|source_user_id)$/i)) return `${clean} (Junk)`;
    if (rawCol.includes('_edit_lock') || rawCol.includes('_edit_last') || rawCol.includes('_price') || rawCol.includes('_version')) return `${clean} (System Data)`;
    if (rawCol.startsWith('line_item_')) return `${clean} (Auto-Parsed)`;

    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  };

  const discoverDescriptionHeadings = (rows, cols) => {
    const discovered = new Set();
    if (!rows || rows.length === 0) return [];

    // Scan ALL columns for structural headings to ensure no data is missed
    const candidateCols = cols;

    // Scan first 100 rows for structural headings in candidate columns
    rows.slice(0, 100).forEach(row => {
      candidateCols.forEach(col => {
        const content = row[col] || '';
        if (typeof content !== 'string') return;

        const matches = content.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>|<p[^>]*>\s*<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>\s*<\/p>|<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>[:\s]*(?:<br\s*\/?>|$)/gi);
        if (matches) {
          matches.forEach(m => {
            // EXCLUDE: If the match is likely a list-item question (FAQ style)
            if (m.toLowerCase().includes('<li>') || m.includes('?')) return;

            const text = m.replace(/<[^>]*>?/gm, '').replace(/[:\s-]+$/, '').trim();

            // Filter for likely headings (3-50 chars, must not be a question)
            if (text && text.length > 2 && text.length < 50 && !text.endsWith('?') && !['FAQ', 'Description', 'Reviews', 'Short Description', 'Name', 'Title'].includes(text)) {
              discovered.add(text);
            }
          });
        }
      });
    });

    const results = Array.from(discovered).map(h => ({
      heading: h,
      shopifyMeta: `product.metafields.custom.${h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '')}`
    }));

    return results;
  };

  const runHeuristicDiscovery = (rows, headers, flowType) => {
    const autoMap = { meta: [], core: {} };
    const KNOWN = KNOWN_WOO_COLS[flowType] || [];

    // 1. Identify Core Mapping Suggestions
    if (flowType === 'products') {
      const bestVendor = headers.find(h => /vendor|brand/i.test(h) && !h.toLowerCase().includes('tags')) || '';
      const seoTitle = headers.find(h => /seo.*title/i.test(h) || /yoast.*title/i.test(h)) || '';
      const seoDesc = headers.find(h => /seo.*desc/i.test(h) || /yoast.*desc/i.test(h)) || '';
      const descHeader = headers.find(h => /description/i.test(h) && !h.toLowerCase().includes('short')) || 'Description';
      const shortDescHeader = headers.find(h => /short.*desc|excerpt/i.test(h)) || 'Short description';
      const subtitleHeader = headers.find(h => /subtitle|sub-title|meta:.*subtitle/i.test(h)) || '';
      autoMap.core = { vendor: bestVendor, categories: 'Categories', tags: 'Tags', desc: descHeader, shortDesc: shortDescHeader, subtitle: subtitleHeader, seoTitle, seoDesc };
    } else if (flowType === 'customers') {
      autoMap.core = {
        first: headers.find(h => /billing_first_name|first_name/i.test(h)) || headers.find(h => /billing first name|first name/i.test(h)) || '',
        last: headers.find(h => /billing_last_name|last_name/i.test(h)) || headers.find(h => /billing last name|last name/i.test(h)) || '',
        email: headers.find(h => /billing_email|user_email/i.test(h)) || headers.find(h => /billing email|email/i.test(h)) || '',
        company: headers.find(h => /billing_company|company/i.test(h)) || '',
        addr1: headers.find(h => /billing_address_1|address_1/i.test(h)) || '',
        addr2: headers.find(h => /billing_address_2|address_2/i.test(h)) || '',
        city: headers.find(h => /billing_city|city/i.test(h)) || '',
        province: headers.find(h => /billing_state|state/i.test(h)) || '',
        country: headers.find(h => /billing_country|country/i.test(h)) || '',
        zip: headers.find(h => /billing_postcode|postcode|zip/i.test(h)) || '',
        addrPhone: headers.find(h => /billing_phone|phone/i.test(h)) || '',
        phone: headers.find(h => /billing_phone|phone/i.test(h)) || '',
        emailMarketing: headers.find(h => /mailchimp_woocommerce_is_subscribed/i.test(h)) ? 'yes' : 'no',
        smsMarketing: 'no',
        taxExempt: 'no',
        tags: headers.find(h => h === 'role') || '',
        note: headers.find(h => h === 'description') || ''
      };
    } else if (flowType === 'orders') {
      autoMap.core = {
        id: headers.find(h => /order number|order id/i.test(h)) || '',
        date: headers.find(h => /order date|date/i.test(h)) || '',
        email: headers.find(h => /billing email|email/i.test(h)) || '',
        status: headers.find(h => /order status|status/i.test(h)) || '',
        itemName: headers.find(h => /item.*name|product.*name/i.test(h) && !/line_item/i.test(h)) || '',
        itemSku: headers.find(h => /item.*sku|product.*sku/i.test(h) && !/line_item/i.test(h)) || '',
        itemQty: headers.find(h => /item.*qty|item.*quantity/i.test(h) && !/line_item/i.test(h)) || '',
        itemPrice: headers.find(h => /item.*cost|item.*price/i.test(h) && !/line_item/i.test(h)) || ''
      };
    }

    // 2. Identify Metafield Suggestions (Tier 2)
    let count = 0;
    headers.filter(h => !KNOWN.includes(h)).forEach(col => {
      const clean = generateCleanMetaName(col);
      if (!clean.includes('(Junk)') && !clean.includes('(System Data)') && count < 12) {
        const ns = flowType === 'orders' ? 'orders' : 'custom';
        autoMap.meta.push({
          wooCol: col,
          name: clean.replace(' (Junk)', '').trim(),
          shopifyMeta: `${flowType === 'customers' ? 'customer' : flowType === 'orders' ? 'order' : 'product'}.metafields.${ns}.${slugify(clean).replace(/-/g, '_')}`,
          type: col.toLowerCase().includes('description') || col.toLowerCase().includes('content') ? 'multi_line_text_field' : 'single_line_text_field'
        });
        count++;
      }
    });

    // 3. Products-specific Section Extraction
    if (flowType === 'products') {
      autoMap.extracted = discoverDescriptionHeadings(rows, headers);
      if (autoMap.extracted.length === 0) {
        autoMap.extracted.push({ heading: 'Ingredients', shopifyMeta: 'product.metafields.custom.ingredients' });
        autoMap.extracted.push({ heading: 'FAQ', shopifyMeta: 'product.metafields.custom.faq' });
      }
    }

    return autoMap;
  };

  const analyzeDataWithAI = async (flowType) => {
    const rawData = flowType === 'products' ? prodData.final : flowType === 'customers' ? custData.raw : ordData.raw;
    const headers = flowType === 'products' ? prodData.headers : flowType === 'customers' ? custData.cols : ordData.cols;
    if (!rawData) return;
    setIsAnalyzing(true);

    try {
      // --- SMART STRATIFIED SAMPLING (GOLDEN SAMPLE) ---
      let sampleData = [];
      if (flowType === 'products') {
        const parents = rawData.filter(r => !(r['Type'] || '').toLowerCase().includes('variation'));

        // 1. 10 rows with longest descriptions
        const longestDesc = [...parents].sort((a, b) => (b['Description']?.length || 0) - (a['Description']?.length || 0)).slice(0, 10);

        // 2. 20 rows with highest count of custom metafields (Meta: or Attribute)
        const countMeta = (row) => Object.keys(row).filter(k => (k.startsWith('Meta:') || k.startsWith('Attribute') || k.startsWith('_')) && row[k]).length;
        const mostMeta = [...parents].sort((a, b) => countMeta(b) - countMeta(a)).slice(0, 20);

        // 3. 20 evenly distributed rows
        const step = Math.max(1, Math.floor(parents.length / 20));
        const distributed = [];
        for (let i = 0; i < parents.length && distributed.length < 20; i += step) {
          distributed.push(parents[i]);
        }

        // Combine and deduplicate by ID/SKU
        const combined = [...longestDesc, ...mostMeta, ...distributed].filter(Boolean);
        const unique = new Map();
        combined.forEach(r => unique.set(r['ID'] || r['SKU'] || Math.random(), r));
        sampleData = Array.from(unique.values()).slice(0, 50);
      } else {
        sampleData = rawData.slice(0, 50);
      }

      // --- AI DISCOVERY ---
      const apiKey = prodMap.apiKey || "";
      if (!apiKey) throw new Error("API Key Missing. Please enter your Gemini API key in the field below.");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

      let promptText = "";
      if (flowType === 'products') {
        promptText = `Expert Shopify Data Auditor. Review this GENERATED Shopify CSV file for quality.
          
          TASK:
          1. Review the Golden Sample of the FINAL CSV.
          2. QUALITY AUDIT:
             - Is the 'Description' column populated? (CRITICAL)
             - Are the 'product.metafields.custom' columns populated with extracted content?
             - Are SEO titles/descriptions within limits (70/320)?
             - Are prices and SKUs logically mapped?
          
          GROUNDING:
          Live Site URL: ${sampleProductUrl || 'None'}. Compare the live PDP content to this generated CSV row.
          
          OUTPUT: Respond ONLY with a valid JSON object:
          {
            "analysisSummary": "General health of the final CSV.",
            "auditAdvice": [
              { "type": "warning|suggestion|error", "message": "Clear actionable advice", "field": "The Shopify field affected" }
            ]
          }`;
      } else if (flowType === 'customers') {
        promptText = `Expert Shopify Data Auditor. Review this WooCommerce CUSTOMER export and map it to Shopify.
          TASK:
          1. Match WooCommerce columns (billing_first_name, user_email, etc.) to Shopify Required fields.
          2. Identify valuable custom columns for Metafields (e.g., bio, birth_date, points).
          OUTPUT: Respond ONLY with a valid JSON object:
          {
            "analysisSummary": "Summary of data quality.",
            "orchestrationPlan": {
              "coreMappings": { "first": "source_col", "last": "source_col", "email": "source_col", "phone": "source_col", "addr1": "source_col", "city": "source_col", "province": "source_col", "country": "source_col", "zip": "source_col" },
              "metafields": [ { "wooCol": "source_col", "name": "Display Name", "shopifyMeta": "customer.metafields.custom.key", "type": "single_line_text_field" } ]
            },
            "auditAdvice": [ { "type": "suggestion", "message": "Why you mapped this way", "field": "The Shopify field" } ]
          }`;
      } else if (flowType === 'orders') {
        promptText = `Expert Shopify Data Auditor. Review this WooCommerce ORDER export.
          TASK:
          1. Identify Order ID, Date, Email, Status, and Line Item columns.
          2. Suggest mappings for Matrixify or Shopify API format.
          OUTPUT: Respond ONLY with a valid JSON object:
          {
            "analysisSummary": "Summary of order data.",
            "orchestrationPlan": {
              "coreMappings": { "id": "source_col", "date": "source_col", "email": "source_col", "status": "source_col", "itemName": "source_col", "itemSku": "source_col", "itemQty": "source_col", "itemPrice": "source_col" },
              "metafields": [ { "wooCol": "source_col", "name": "Display Name", "shopifyMeta": "order.metafields.custom.key", "type": "single_line_text_field" } ]
            },
            "auditAdvice": [ { "type": "suggestion", "message": "Advice for order migration", "field": "Mapping" } ]
          }`;
      }

      const fullPrompt = promptText + `\n\n### DATA SAMPLE:\n${JSON.stringify({ headers, rows: sampleData })}`;

      const payload = {
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.1 }
      };

      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(`API Error ${res.status}: ${errBody.error?.message || res.statusText}`);
      }
      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // AGGRESSIVE JSON SCRUBBER: Extract only what's between first { and last }
      let cleanedJson = rawText;
      const firstBrace = rawText.indexOf('{');
      const lastBrace = rawText.lastIndexOf('}');
      if (firstBrace > -1 && lastBrace > -1) {
        cleanedJson = rawText.substring(firstBrace, lastBrace + 1);
      }

      let parsedReport;
      try {
        parsedReport = JSON.parse(cleanedJson);
      } catch (e) {
        console.error("Scrubbed JSON error:", cleanedJson);
        throw new Error("AI did not return a valid JSON plan. The response was malformed.");
      }

      if (parsedReport) {
        const plan = parsedReport.orchestrationPlan;

        if (flowType === 'products') {
          setProdMap(p => ({ ...p, auditAdvice: parsedReport.auditAdvice || [] }));
          setProdReport({ summary: parsedReport.analysisSummary || "Audit completed. Review findings below." });

          if (plan) {
            const aiSections = plan.extractedSections || [];
            const mergedSections = [...aiSections];
            prodMap.extracted.forEach(s => {
              if (!mergedSections.some(ms => ms.heading.toLowerCase() === s.heading.toLowerCase())) mergedSections.push(s);
            });

            const aiMeta = plan.metafields || [];
            if (prodMap.core.shortDesc && !aiMeta.some(m => m.shopifyMeta.includes('short_description'))) {
              aiMeta.push({ wooCol: prodMap.core.shortDesc, name: 'Short Description', shopifyMeta: 'product.metafields.custom.short_description', type: 'multi_line_text_field' });
            }

            const suggestions = [];
            if (plan.coreMappings) {
              Object.keys(plan.coreMappings).forEach(key => {
                if (plan.coreMappings[key] && plan.coreMappings[key] !== prodMap.core[key]) {
                  suggestions.push({ type: 'suggestion', field: key, message: `AI suggests ${key} -> "${plan.coreMappings[key]}"`, suggestion: plan.coreMappings[key] });
                }
              });
            }
            setProdMap(p => ({ ...p, auditAdvice: [...(parsedReport.auditAdvice || []), ...suggestions] }));
          }
        } else if (flowType === 'customers') {
          if (plan) setCustMap(p => ({ ...p, core: { ...p.core, ...plan.coreMappings }, meta: plan.metafields || [] }));
          setCustReport({ summary: parsedReport.analysisSummary || "AI Audit complete." });
        } else if (flowType === 'orders') {
          if (plan) setOrdMap(p => ({ ...p, core: { ...p.core, ...plan.coreMappings }, meta: plan.metafields || [] }));
          setOrdReport({ summary: parsedReport.analysisSummary || "AI Audit complete." });
        }
      } else { throw new Error("Invalid AI schema"); }
    } catch (error) {
      setProdReport({ summary: "Audit failed.", error: error.message });
      alert(`Audit Error: ${error.message}`);
    } finally { setIsAnalyzing(false); }
  };

  const handleRescue = (flowType, col) => {
    const cleanName = generateCleanMetaName(col).replace(/ \(Junk\)|\(Auto-Parsed\)/, '').trim();
    const ns = flowType === 'orders' ? 'orders' : 'custom';
    const newMeta = { wooCol: col, name: cleanName, shopifyMeta: `${flowType === 'customers' ? 'customer' : flowType === 'orders' ? 'order' : 'product'}.metafields.${ns}.${slugify(cleanName).replace(/-/g, '_')}`, type: 'single_line_text_field' };
    if (flowType === 'products') setProdMap(p => ({ ...p, meta: [...p.meta, newMeta] }));
    if (flowType === 'customers') setCustMap(p => ({ ...p, meta: [...p.meta, newMeta] }));
    if (flowType === 'orders') setOrdMap(p => ({ ...p, meta: [...p.meta, newMeta] }));
  };

  const handleRemoveMeta = (flowType, col) => {
    if (flowType === 'products') setProdMap(p => ({ ...p, meta: p.meta.filter(m => m.wooCol !== col) }));
    if (flowType === 'customers') setCustMap(p => ({ ...p, meta: p.meta.filter(m => m.wooCol !== col) }));
    if (flowType === 'orders') setOrdMap(p => ({ ...p, meta: p.meta.filter(m => m.wooCol !== col) }));
  };

  const updateMetafield = (flowType, wooCol, field, value) => {
    const updater = p => ({ ...p, meta: p.meta.map(m => m.wooCol === wooCol ? { ...m, [field]: value } : m) });
    if (flowType === 'products') setProdMap(updater);
    if (flowType === 'customers') setCustMap(updater);
    if (flowType === 'orders') setOrdMap(updater);
  };

  const handleAddExtractedSection = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      e.preventDefault();
      const val = e.target.value.trim();
      const cleanKey = val.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '');
      setProdMap(prev => ({
        ...prev, extracted: [...(prev.extracted || []), { heading: val, shopifyMeta: `product.metafields.custom.${cleanKey}` }]
      }));
      e.target.value = '';
    }
  };

  const handleReviewsUpload = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setIsProcessing(true);
    const isXML = file.name.toLowerCase().endsWith('.xml');
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        if (!content) throw new Error("File is empty");

        let parsed = [];
        if (isXML) {
          parsed = parseAndNormalizeXML(content);
        } else {
          parsed = parseCSV(content);
        }
        if (!parsed || parsed.length < 2) throw new Error(`${isXML ? 'XML' : 'CSV'} has no data rows`);

        const headers = (parsed[0] || []).map(h => (h || '').trim());
        if (headers.length === 0) throw new Error(`${isXML ? 'XML' : 'CSV'} has no headers`);

        const rows = parsed.slice(1).map(r => {
          const obj = {};
          headers.forEach((h, i) => { if (h) obj[h] = r[i]; });
          return obj;
        });

        setTimeout(() => {
          const formattedReviews = [];
          rows.forEach(review => {
            if (!review) return;
            const isApproved = String(review['comment_approved'] || review['status'] || '1').trim().toLowerCase();
            if (isApproved !== '1' && isApproved !== 'approved' && isApproved !== 'true' && isApproved !== 'yes') return;

            let pTitle = review['product_title'] || review['product_name'] || review['post_title'] || review['product_id'] || review['post_id'];
            if (!pTitle) pTitle = "Imported Review";

            const productHandle = slugify(pTitle);
            if (!productHandle) return;

            formattedReviews.push({
              'product_handle': productHandle,
              'state': 'published',
              'rating': String(review['rating'] || review['star'] || '5').trim(),
              'title': String(review['title'] || review['subject'] || 'Product Review').trim(),
              'author': String(review['author'] || review['comment_author'] || 'Verified Buyer').trim(),
              'email': String(review['email'] || review['comment_author_email'] || '').trim(),
              'body': cleanText(review['content'] || review['comment_content'] || ''),
              'created_at': String(review['date'] || review['comment_date'] || '').trim()
            });
          });

          if (formattedReviews.length === 0) {
            alert("No approved reviews found in CSV.");
            setIsProcessing(false);
            return;
          }

          setProdData(p => ({ ...p, reviews: formattedReviews }));
          setIsProcessing(false);
          setTimeout(nextStep, 100);
        }, 800);
      } catch (err) {
        console.error("Reviews Upload Error:", err);
        setIsProcessing(false);
        alert(`Error parsing reviews: ${err.message}`);
      }
    };
    reader.onerror = () => {
      setIsProcessing(false);
      alert("Error reading file.");
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- DATA PROCESSING ENGINES ---
  const processProducts = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const shopifyFormat = []; const redirectsFormat = [];
      const newHeaders = [...SHOPIFY_PRODUCT_HEADERS];

      // Ensure Tier 2 Metafields are in headers
      prodMap.meta.forEach(m => { if (!newHeaders.includes(m.shopifyMeta)) newHeaders.push(m.shopifyMeta); });
      prodMap.extracted.forEach(sec => { if (!newHeaders.includes(sec.shopifyMeta)) newHeaders.push(sec.shopifyMeta); });

      const baseTemplate = newHeaders.reduce((acc, curr) => ({ ...acc, [curr]: '' }), {});

      const productsMap = new Map();
      const variations = [];

      prodData.raw.forEach(row => {
        const typeStr = (row['Type'] || '').toLowerCase();
        if (typeStr.includes('variation')) variations.push(row);
        else productsMap.set(row['ID'] || row['SKU'], { ...row, variants: [] });
      });

      variations.forEach(v => {
        let parentId = v['Parent'] || '';
        if (parentId.startsWith('id:')) parentId = parentId.replace('id:', '').trim();
        const parent = productsMap.get(parentId) || Array.from(productsMap.values()).find(p => p['SKU'] === parentId || p['ID'] === parentId);
        if (parent) parent.variants.push(v);
      });

      const processRow = (dataRow, handle, title, isParent, parentRow = null) => {
        const rawDesc = getVal(dataRow, prodMap.core.desc) || (parentRow ? getVal(parentRow, prodMap.core.desc) : '');
        let finalDescription = cleanText(rawDesc);
        let extractedMetaData = {};

        if (prodMap.strategy === 'extract-metafields') {
          const ext = extractSectionsToMetafields(rawDesc, prodMap.extracted);
          finalDescription = ext.main;
          extractedMetaData = ext.meta;
        }

        // --- CATEGORY SAFE MODE & TAG EXTRACTION ---
        const rawCats = getVal(dataRow, prodMap.core.categories) || (parentRow ? getVal(parentRow, prodMap.core.categories) : '') || '';
        const catParts = rawCats.split('>').map(c => c.trim()).filter(Boolean);
        const specificType = catParts.length > 0 ? catParts[catParts.length - 1] : '';

        const existingTags = (getVal(dataRow, prodMap.core.tags) || (parentRow ? getVal(parentRow, prodMap.core.tags) : '') || '').split(',').map(t => t.trim());
        const allTags = Array.from(new Set([...existingTags, ...catParts])).filter(Boolean).join(', ');

        // --- TIER 1 CORE MAPPINGS ---
        const outRow = {
          ...baseTemplate,
          'URL handle': handle,
          'Title': isParent ? title : '',
          'Description': isParent ? finalDescription : '',
          'Vendor': getVal(dataRow, prodMap.core.vendor) || (parentRow ? getVal(parentRow, prodMap.core.vendor) : ''),
          'Product category': '', // SAFE MODE: Keep blank
          'Type': specificType,
          'Tags': allTags,
          'Published on online store': (getVal(dataRow, 'Published') || (parentRow ? getVal(parentRow, 'Published') : '')) === '1' ? 'TRUE' : 'FALSE',
          'Status': (getVal(dataRow, 'Published') || (parentRow ? getVal(parentRow, 'Published') : '')) === '1' ? 'active' : 'draft',
          'SKU': getVal(dataRow, 'SKU'),
          'Price': getVal(dataRow, 'Sale price') || getVal(dataRow, 'Regular price') || (parentRow ? getVal(parentRow, 'Regular price') : ''),
          'Compare-at price': getVal(dataRow, 'Sale price') ? getVal(dataRow, 'Regular price') : '',

          'Weight value (grams)': calculateWeight(dataRow) || (parentRow ? calculateWeight(parentRow) : ''),
          'Inventory tracker': 'shopify',
          'Inventory quantity': (getVal(dataRow, 'Stock') || '0').trim(),
          'Continue selling when out of stock': (getVal(dataRow, 'Backorders allowed?') || (parentRow ? getVal(parentRow, 'Backorders allowed?') : '')) === 'yes' ? 'continue' : 'deny',
          'Requires shipping': (getVal(dataRow, 'Type') || '').toLowerCase().match(/virtual|downloadable/) ? 'FALSE' : 'TRUE',
          'Variant Taxable': (getVal(dataRow, 'Tax status') || (parentRow ? getVal(parentRow, 'Tax status') : '')) === 'taxable' ? 'TRUE' : 'FALSE',
          'Fulfillment service': 'manual',

          'Product image URL': isParent ? (getVal(dataRow, 'Images') ? getVal(dataRow, 'Images').split(',')[0].trim().replace(/\s/g, '%20') : '') : '',
          'Image position': isParent ? '1' : '',
          'Variant image URL': !isParent ? (getVal(dataRow, 'Images') ? getVal(dataRow, 'Images').split(',')[0].trim().replace(/\s/g, '%20') : '') : '',

          'SEO title': (getVal(dataRow, prodMap.core.seoTitle) || (parentRow ? getVal(parentRow, prodMap.core.seoTitle) : '') || title).substring(0, 70),
          'SEO description': (getVal(dataRow, prodMap.core.seoDesc) || (parentRow ? getVal(parentRow, prodMap.core.seoDesc) : '') || extractPlainTextForSeo(rawDesc)).substring(0, 320)
        };

        // --- TIER 2 METAFIELDS & DOUBLE MAPPING ---
        prodMap.meta.forEach(meta => {
          const val = getVal(dataRow, meta.wooCol) || (parentRow ? getVal(parentRow, meta.wooCol) : '');
          if (val) outRow[meta.shopifyMeta] = cleanText(val);
        });

        Object.keys(extractedMetaData).forEach(k => outRow[k] = purifyHtml(extractedMetaData[k]));

        // --- THE ATTRIBUTE FACTORY (Option 1-3 vs 4+) ---
        const attributes = [];
        for (let i = 1; i <= 10; i++) {
          const aName = getVal(dataRow, `Attribute ${i} name`) || getVal(parentRow, `Attribute ${i} name`);
          const aVal = getVal(dataRow, `Attribute ${i} value(s)`);
          if (aName && aVal) attributes.push({ name: aName, value: aVal });
        }

        attributes.forEach((attr, idx) => {
          if (idx < 3) {
            outRow[`Option${idx + 1} name`] = attr.name;
            outRow[`Option${idx + 1} value`] = attr.value;
          } else {
            // Attribute 4+ converts to Metafield AND Tag
            const metaKey = `product.metafields.custom.${slugify(attr.name).replace(/-/g, '_')}`;
            outRow[metaKey] = attr.value;
            outRow['Tags'] += `, ${attr.name}: ${attr.value}`;
            if (!newHeaders.includes(metaKey)) newHeaders.push(metaKey);
          }
        });

        return outRow;
      };

      const handleRegistry = new Set();
      productsMap.forEach(parent => {
        const title = parent['Name'] || 'Untitled';
        let handle = slugify(parent['SKU'] || title);

        // --- HANDLE COLLISION PREVENTION ---
        if (handleRegistry.has(handle)) {
          handle = `${handle}-${Math.floor(Math.random() * 1000)}`;
        }
        handleRegistry.add(handle);

        // --- IMAGE EXPANSION ENGINE ---
        const images = (parent['Images'] || '').split(',').map(i => i.trim()).filter(Boolean);

        // Parent Row
        shopifyFormat.push(processRow(parent, handle, title, true));
        redirectsFormat.push({ 'Redirect from': `/product/${handle}`, 'Redirect to': `/products/${handle}` });

        // Extra Image Rows for Parent
        if (images.length > 1) {
          for (let i = 1; i < images.length; i++) {
            shopifyFormat.push({
              ...baseTemplate,
              'URL handle': handle,
              'Product image URL': images[i],
              'Image position': (i + 1).toString()
            });
          }
        }

        if (parent.variants && parent.variants.length > 0) {
          parent.variants.forEach(variant => {
            shopifyFormat.push(processRow(variant, handle, title, false, parent));
          });
        }
      });

      setProdData(p => ({ ...p, final: shopifyFormat, redirects: redirectsFormat, headers: newHeaders }));
      setIsProcessing(false); nextStep();
    }, 800);
  };

  const processCustomers = () => {
    if (!custData.raw || custData.raw.length === 0) {
      alert("No customer data to process.");
      return;
    }
    setIsProcessing(true);
    setTimeout(() => {
      try {
        const formatted = [];
        const newHeaders = [...SHOPIFY_CUSTOMER_HEADERS];
        if (custMap.meta && Array.isArray(custMap.meta)) {
          custMap.meta.forEach(m => { if (m.shopifyMeta && !newHeaders.includes(m.shopifyMeta)) newHeaders.push(m.shopifyMeta); });
        }
        const baseTemplate = newHeaders.reduce((acc, curr) => ({ ...acc, [curr]: '' }), {});

        custData.raw.forEach(row => {
          if (!row) return;
          const marketingRaw = getVal(row, custMap.core?.emailMarketing);
          const marketingStatus = (marketingRaw || '').toLowerCase();
          const isMarketing = marketingStatus === '1' || marketingStatus === 'yes' || marketingStatus === 'subscribed' || marketingStatus === 'true';

          const cRow = {
            ...baseTemplate,
            'First Name': getVal(row, custMap.core?.first),
            'Last Name': getVal(row, custMap.core?.last),
            'Email': getVal(row, custMap.core?.email),
            'Default Address Company': getVal(row, custMap.core?.company),
            'Default Address Address1': getVal(row, custMap.core?.addr1),
            'Default Address Address2': getVal(row, custMap.core?.addr2),
            'Default Address City': getVal(row, custMap.core?.city),
            'Default Address Province Code': getVal(row, custMap.core?.province),
            'Default Address Country Code': getVal(row, custMap.core?.country),
            'Default Address Zip': getVal(row, custMap.core?.zip),
            'Default Address Phone': getVal(row, custMap.core?.addrPhone),
            'Phone': getVal(row, custMap.core?.phone),
            'Accepts Email Marketing': isMarketing ? 'yes' : 'no',
            'Accepts SMS Marketing': custMap.core?.smsMarketing === 'yes' ? 'yes' : 'no',
            'Tax Exempt': custMap.core?.taxExempt === 'yes' ? 'yes' : 'no',
            'Tags': getVal(row, custMap.core?.tags) || 'migrated_customer',
            'Note': getVal(row, custMap.core?.note)
          };
          if (custMap.meta && Array.isArray(custMap.meta)) {
            custMap.meta.forEach(meta => {
              const val = getVal(row, meta.wooCol);
              if (val) cRow[meta.shopifyMeta] = val;
            });
          }
          formatted.push(cRow);
        });
        setCustData(p => ({ ...p, final: formatted, headers: newHeaders }));
        setIsProcessing(false);
        setTimeout(nextStep, 100);
      } catch (err) {
        console.error("Process Customers Error:", err);
        setIsProcessing(false);
        alert("Error processing customers. Check console.");
      }
    }, 800);
  };

  const processOrders = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const orderMap = new Map();
      ordData.raw.forEach(row => {
        const oId = row[ordMap.core.id]; if (!oId) return;
        if (!orderMap.has(oId)) orderMap.set(oId, []);
        orderMap.get(oId).push(row);
      });

      if (ordMap.mode === 'api') {
        const payloads = [];
        orderMap.forEach((lines, oId) => {
          const firstLine = lines[0];
          const status = (firstLine[ordMap.core.status] || '').toLowerCase();
          const financial = status.includes('completed') || status.includes('processing') ? 'paid' : 'pending';
          const fulfillment = status.includes('completed') ? 'fulfilled' : 'unfulfilled';
          const allLineItems = [];
          lines.forEach(line => { allLineItems.push(...parseSerializedLineItems(line, ordMap.core.itemName, ordMap.core.itemSku, ordMap.core.itemQty, ordMap.core.itemPrice)); });

          payloads.push({
            order: {
              name: `#${oId}`, email: firstLine[ordMap.core.email] || '', created_at: firstLine[ordMap.core.date] || '',
              financial_status: financial, fulfillment_status: fulfillment, send_receipt: false, send_fulfillment_receipt: false, inventory_behaviour: "bypass",
              line_items: allLineItems.map(item => ({ title: item.title, sku: item.sku, quantity: parseInt(item.qty, 10) || 1, price: parseFloat(item.price || 0).toFixed(2) })),
              metafields: ordMap.meta.map(m => {
                const parts = m.shopifyMeta.split('.');
                return { namespace: parts[2] || 'custom', key: parts[3] || 'unknown', value: cleanText(firstLine[m.wooCol]), type: m.type };
              }).filter(m => m.value)
            }
          });
        });
        setOrdData(p => ({ ...p, final: payloads, headers: [] }));
        setIsProcessing(false); nextStep(); return;
      }

      const formatted = [];
      const newHeaders = [...MATRIXIFY_ORDER_HEADERS];
      ordMap.meta.forEach(m => { const parts = m.shopifyMeta.split('.'); const mKey = parts.length >= 4 ? `Metafield: ${parts[2]}.${parts[3]}` : m.shopifyMeta; if (!newHeaders.includes(mKey)) newHeaders.push(mKey); });
      const baseTemplate = newHeaders.reduce((acc, curr) => ({ ...acc, [curr]: '' }), {});

      orderMap.forEach((lines, oId) => {
        let isFirst = true;
        lines.forEach(line => {
          const status = (line[ordMap.core.status] || '').toLowerCase();
          const financial = status.includes('completed') || status.includes('processing') ? 'paid' : 'pending';
          const fulfillment = status.includes('completed') ? 'fulfilled' : 'unfulfilled';
          const lineItems = parseSerializedLineItems(line, ordMap.core.itemName, ordMap.core.itemSku, ordMap.core.itemQty, ordMap.core.itemPrice);

          lineItems.forEach((item, index) => {
            const oRow = {
              ...baseTemplate, 'Name': `#${oId}`, 'Command': (isFirst && index === 0) ? 'NEW' : '',
              'Customer: Email': (isFirst && index === 0) ? line[ordMap.core.email] : '',
              'Created At': (isFirst && index === 0) ? line[ordMap.core.date] : '',
              'Payment: Status': (isFirst && index === 0) ? financial : '',
              'Fulfillment: Status': (isFirst && index === 0) ? fulfillment : '',
              'Line: Type': 'Line Item', 'Line: Title': item.title, 'Line: SKU': item.sku, 'Line: Quantity': item.qty, 'Line: Price': item.price
            };
            if (isFirst && index === 0) {
              ordMap.meta.forEach(meta => {
                const val = line[meta.wooCol];
                if (val) {
                  const parts = meta.shopifyMeta.split('.');
                  const mKey = parts.length >= 4 ? `Metafield: ${parts[2]}.${parts[3]}` : meta.shopifyMeta;
                  oRow[mKey] = cleanText(val);
                }
              });
            }
            formatted.push(oRow);
          });
          isFirst = false;
        });
      });
      setOrdData(p => ({ ...p, final: formatted, headers: newHeaders }));
      setIsProcessing(false); nextStep();
    }, 800);
  };

  const handleSimulateApiSync = () => {
    const totalOrders = ordData.final ? ordData.final.length : 1;
    setSyncProgress({ active: true, current: 0, total: totalOrders, complete: false });
    let i = 0;
    const interval = setInterval(() => {
      i += Math.floor(Math.random() * 5) + 1;
      if (i >= totalOrders) {
        i = totalOrders;
        clearInterval(interval);
        setTimeout(() => setSyncProgress({ active: false, current: i, total: i, complete: true }), 500);
      }
      setSyncProgress(p => ({ ...p, current: i }));
    }, 300);
  };

  const handleGenerateTestBatch = () => {
    setIsGeneratingTestBatch(true);
    setTimeout(() => {
      let testEmails = new Set(); let testSkus = new Set(); let testTitles = new Set();
      let testOrdersFinal = []; let isMatrixify = ordMap.mode === 'matrixify';

      if (isMatrixify) {
        const allOrderNames = [...new Set(ordData.final.map(r => r['Name']))];
        const selected20 = new Set(allOrderNames.sort(() => 0.5 - Math.random()).slice(0, 20));
        testOrdersFinal = ordData.final.filter(r => selected20.has(r['Name']));
        testOrdersFinal.forEach(r => { if (r['Customer: Email']) testEmails.add(r['Customer: Email'].toLowerCase()); if (r['Line: SKU']) testSkus.add(r['Line: SKU']); if (r['Line: Title']) testTitles.add(r['Line: Title']); });
      } else {
        const shuffled = [...ordData.final].sort(() => 0.5 - Math.random());
        testOrdersFinal = shuffled.slice(0, 20);
        testOrdersFinal.forEach(payload => { const o = payload.order; if (o.email) testEmails.add(o.email.toLowerCase()); o.line_items.forEach(item => { if (item.sku) testSkus.add(item.sku); if (item.title) testTitles.add(item.title); }); });
      }

      const testCustomersFinal = custData.final.filter(c => testEmails.has((c[custMap.core.email] || c['Email'] || '').toLowerCase()));

      // FIX: Ensure all rows for a handle are included so Vendor (Parent) isn't lost
      const matchedHandles = new Set(prodData.final.filter(p => testSkus.has(p['SKU']) || testTitles.has(p['Title'])).map(p => p['URL handle']));
      const testProductsFinal = prodData.final.filter(p => matchedHandles.has(p['URL handle']));
      const testReviewsFinal = (prodData.reviews && prodData.reviews.length > 0) ? prodData.reviews.slice(0, 20) : [];

      setTestBatchData({ orders: testOrdersFinal, customers: testCustomersFinal, products: testProductsFinal, reviews: testReviewsFinal, isMatrixify });
      setIsGeneratingTestBatch(false);
    }, 1200);
  };

  // --- UI RENDERERS ---
  const renderMetafieldsTable = (flowType, mapState) => {
    const dataContext = flowType === 'customers' ? custData : flowType === 'orders' ? ordData : prodData;
    return (
      <div className="border-2 border-blue-200 bg-white rounded-xl p-5 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-4"><CheckCircle className="w-5 h-5 text-blue-600" /><h3 className="text-lg font-bold text-gray-900">Tier 2: Approved Metafields</h3></div>
        {mapState.meta.length === 0 ? (
          <div className="bg-gray-50 p-6 rounded text-sm text-gray-500 text-center border border-dashed">No custom columns approved.</div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-gray-50 text-gray-700 shadow-sm border-b">
                <tr><th className="p-3 font-bold w-1/4">Source Column</th><th className="p-3 font-bold min-w-[150px]">Shopify Name</th><th className="p-3 font-bold min-w-[250px]">Shopify Key</th><th className="p-3 font-bold text-center w-12"></th></tr>
              </thead>
              <tbody>
                {mapState.meta.map((m, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 text-gray-900 truncate max-w-[150px]" title={m.wooCol}>
                      <div className="font-bold truncate">{m.wooCol}</div>
                      <div className="text-[10px] text-blue-500 font-bold uppercase">{dataContext.colStats?.[m.wooCol] || 0}% Populated</div>
                    </td>
                    <td className="p-2"><input value={m.name} onChange={(e) => updateMetafield(flowType, m.wooCol, 'name', e.target.value)} className="w-full border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 border outline-none" /></td>
                    <td className="p-2"><input value={m.shopifyMeta} onChange={(e) => updateMetafield(flowType, m.wooCol, 'shopifyMeta', e.target.value)} className="w-full border-gray-300 rounded px-2 py-1 text-sm font-mono text-blue-600 focus:ring-1 border outline-none" /></td>
                    <td className="p-2 text-center"><button onClick={() => handleRemoveMeta(flowType, m.wooCol)} className="text-gray-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50"><X className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const renderJunkDrawer = (flowType, rawCols, mapState) => {
    // Determine used core and meta columns
    const usedCore = Object.values(mapState.core).filter(val => typeof val === 'string' && rawCols.includes(val));
    const usedMeta = mapState.meta.map(m => m.wooCol);
    const allRejected = rawCols.filter(c => !KNOWN_WOO_COLS[flowType]?.includes(c) && !usedMeta.includes(c));
    const filtered = allRejected.filter(c => !rejectedSearch || c.toLowerCase().includes(rejectedSearch.toLowerCase()) || generateCleanMetaName(c).toLowerCase().includes(rejectedSearch.toLowerCase()));
    const dataContext = flowType === 'customers' ? custData : flowType === 'orders' ? ordData : prodData;

    return (
      <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden mb-8">
        <button onClick={() => setShowRejected(!showRejected)} className="w-full flex items-center justify-between p-5 bg-gray-50 hover:bg-gray-100 border-b transition-colors">
          <div className="flex items-center gap-3">
            <div className="bg-gray-200 p-1.5 rounded-md"><AlertTriangle className="w-4 h-4 text-gray-600" /></div>
            <div className="text-left"><h3 className="text-base font-bold text-gray-900">Tier 3: The Junk Drawer</h3><p className="text-xs text-gray-500 mt-0.5">{allRejected.length} unused columns hidden.</p></div>
          </div>
          {showRejected ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {/* Search box always visible */}
        <div className="p-5">
          <div className="mb-4 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input type="text" value={rejectedSearch} onChange={(e) => setRejectedSearch(e.target.value)} placeholder="Search rejected columns..." className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          {showRejected && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-2">
              {filtered.map(col => {
                const clean = generateCleanMetaName(col);
                const isJunk = clean.includes('(Junk)'); const isAutoParsed = clean.includes('(Auto-Parsed)'); const isCore = usedCore.includes(col);
                const display = clean.replace(/ \(Junk\)|\(Auto-Parsed\)/, '').trim();
                const pop = dataContext.colStats?.[col] || 0;
                return (
                  <div key={col} className={`flex items-start justify-between bg-white border border-gray-200 p-3 rounded-lg ${isJunk ? 'opacity-60 bg-gray-50' : 'hover:border-gray-300'}`}> 
                    <div className="flex flex-col flex-1 mr-3 min-w-0">
                      <div className="flex items-start gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-gray-800 line-clamp-3 leading-tight">{display}</span>
                        <span className="text-[10px] text-blue-500 font-bold px-1.5 py-0.5 rounded bg-blue-50 mt-1 uppercase tracking-tight">{pop}% Data</span>
                        {isJunk && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase mt-0.5">System Data</span>}
                        {isCore && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase mt-0.5">Core Mapped</span>}
                        {isAutoParsed && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold uppercase mt-0.5">Parsed</span>}
                      </div>
                      <span className="text-[10px] font-mono text-gray-400 truncate">Raw: {col}</span>
                    </div>
                    <button onClick={() => handleRescue(flowType, col)} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded text-blue-600 bg-blue-50 hover:bg-blue-100 flex-shrink-0 transition-all hover:shadow-sm"><Plus className="w-3 h-3" /> Rescue</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-12">
      <header className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-gray-900 p-2 rounded-lg text-white"><Server className="w-6 h-6" /></div>
          <div><h1 className="text-xl font-bold text-gray-900">Modular Migration Engine</h1><p className="text-sm text-gray-500">Universal Data Transformer</p></div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 flex gap-8 flex-col md:flex-row">

        {/* SIDEBAR */}
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sticky top-28">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 px-2">Migration Flows</h3>
            <ul className="space-y-2">
              {[{ id: 'products', title: '1. Products & Reviews', icon: <ShoppingBag className="w-5 h-5" />, data: prodData.final }, { id: 'customers', title: '2. Customers & Users', icon: <Users className="w-5 h-5" />, data: custData.final }, { id: 'orders', title: '3. Historical Orders', icon: <ShoppingCart className="w-5 h-5" />, data: ordData.final }, { id: 'seo', title: '4. Test Batch & Launch', icon: <Search className="w-5 h-5" /> }].map((flow) => (
                <li key={flow.id}>
                  <button onClick={() => switchFlow(flow.id)} className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium transition-colors ${activeFlow === flow.id ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}>
                    <div className="flex items-center gap-3"><span className={activeFlow === flow.id ? 'text-blue-400' : 'text-gray-400'}>{flow.icon}</span>{flow.title}</div>
                    {(flow.data && flow.data.length > 0) ? <CheckCircle className="w-4 h-4 text-green-500" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1">

          {/* FLOW 1: PRODUCTS */}
          {activeFlow === 'products' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 min-h-[600px] animate-in fade-in duration-300">
              <div className="flex items-center gap-3 mb-6 border-b pb-4"><ShoppingBag className="w-8 h-8 text-blue-600" /><h2 className="text-2xl font-bold">Products & Reviews Flow</h2></div>

              {flowStep === 1 && (
                <div className="text-center py-12">
                  <h3 className="text-xl font-bold mb-4">Step 1: Upload WooCommerce Products</h3>
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current.click()}>
                    <input type="file" accept=".csv, .xml" className="hidden" ref={fileInputRef} onChange={(e) => handleFileUpload(e, 'products')} />
                    <FileSpreadsheet className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">Click to upload Products CSV or XML</p>
                  </div>
                  <button onClick={nextStep} className="mt-8 text-gray-500 text-sm hover:underline">Skip to Step 2</button>
                </div>
              )}

              {flowStep === 2 && (
                <div className="animate-in fade-in">
                  <div className="mb-8 p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 text-sm flex gap-2">
                    <Info className="w-5 h-5 flex-shrink-0" />
                    <p>Adjust your mappings below. Once finished, click <strong>Generate & Audit</strong> at the bottom to verify the final Shopify CSV quality.</p>
                  </div>

                  <div className="border border-gray-200 rounded-xl p-5 shadow-sm mb-6 bg-white">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><Database className="w-5 h-5 text-indigo-600" /> Tier 1: Core Mappings</h3>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {['vendor', 'categories', 'tags', 'desc', 'shortDesc', 'subtitle', 'seoTitle', 'seoDesc'].map(key => (
                        <div key={key} className="bg-gray-50 p-3 rounded border">
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{key === 'desc' ? 'Description' : key === 'shortDesc' ? 'Short Desc' : key === 'seoTitle' ? 'SEO Title' : key === 'seoDesc' ? 'SEO Description' : key}</label>
                          <select value={prodMap.core[key]} onChange={(e) => setProdMap(p => ({ ...p, core: { ...p.core, [key]: e.target.value } }))} className="w-full bg-transparent text-sm font-bold outline-none">
                            <option value="">-- Blank --</option>
                            {prodData.cols.map(c => {
                              const pop = prodData.colStats?.[c] || 0;
                              return <option key={c} value={c}>{c} ({pop}%)</option>;
                            })}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-xl p-5 shadow-sm mb-6 bg-white">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Tier 2A: Description Extractions</h3>
                    <div className="mb-4">
                      <select value={prodMap.strategy} onChange={(e) => setProdMap(p => ({ ...p, strategy: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-700">
                        <option value="extract-metafields">Extract Metafields: Splice internal headings into dedicated Shopify Metafields</option>
                        <option value="standard">Standard: Export Main Description as pure Plain Text</option>
                      </select>
                    </div>
                    {prodMap.strategy === 'extract-metafields' && (
                      <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                        <div className="flex items-start gap-3">
                          <Scissors className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
                          <div className="w-full">
                            <label className="block text-sm font-bold text-blue-900 mb-2">Sections to Extract</label>
                            <p className="text-xs text-blue-800 mb-3 leading-relaxed">The engine will cleanly slice the HTML description at these exact headings and map the content into new Metafields.</p>

                            <div className="space-y-2 mb-4 w-full">
                              {prodMap.extracted?.map((section, idx) => (
                                <div key={idx} className="flex items-center gap-3 bg-white border border-blue-200 p-2 rounded shadow-sm w-full">
                                  <span className="text-sm font-bold text-gray-800 min-w-[120px]">{section.heading}</span>
                                  <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                  <span className="text-xs font-mono text-blue-600 flex-1 truncate">{section.shopifyMeta}</span>
                                  <button onClick={() => { setProdMap(prev => ({ ...prev, extracted: prev.extracted.filter((_, i) => i !== idx) })) }} className="hover:bg-red-50 rounded p-1"><X className="w-4 h-4 text-red-500" /></button>
                                </div>
                              ))}
                            </div>
                            <input type="text" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { e.preventDefault(); const val = e.target.value.trim(); const cleanKey = val.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, ''); setProdMap(prev => ({ ...prev, extracted: [...(prev.extracted || []), { heading: val, shopifyMeta: `product.metafields.custom.${cleanKey}` }] })); e.target.value = ''; } }} placeholder="Type heading (e.g. 'FAQ:') and press Enter" className="w-full border border-blue-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {renderMetafieldsTable('products', prodMap)}

                  {renderJunkDrawer('products', prodData.cols, prodMap)}

                  <div className="flex justify-between items-center pt-8 border-t border-gray-100">
                    <button onClick={() => setProdData(p => ({ ...p, raw: null }))} className="text-gray-500 font-bold px-4 py-2">Back</button>
                    <button onClick={() => { processProducts(); }} disabled={isProcessing} className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-lg transition-all">
                      {isProcessing ? 'Generating...' : 'Generate & Audit Blueprint'} <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {flowStep === 3 && (
                <div className="animate-in fade-in">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-8 mb-8">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="p-3 bg-indigo-500/20 rounded-xl"><Wand2 className="w-8 h-8 text-indigo-600" /></div>
                      <div>
                        <h3 className="text-xl font-bold text-indigo-900">Step 3: Senior Data Audit</h3>
                        <p className="text-indigo-700 text-sm">Review the quality of your GENERATED Shopify file.</p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 bg-white/50 p-6 rounded-xl border border-indigo-100 mb-6">
                      <div>
                        <label className="block text-sm font-bold text-indigo-900 mb-2">Gemini API Key</label>
                        <input type="password" value={prodMap.apiKey} onChange={(e) => setProdMap(p => ({ ...p, apiKey: e.target.value }))} className="w-full px-3 py-2 rounded border border-indigo-200 text-sm outline-none shadow-inner" placeholder="AIzaSy..." />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-indigo-900 mb-2">Live URL (Optional)</label>
                        <input type="text" value={sampleProductUrl} onChange={(e) => setSampleProductUrl(e.target.value)} className="w-full px-3 py-2 rounded border border-indigo-200 text-sm outline-none shadow-inner" placeholder="https://..." />
                      </div>
                    </div>

                    <button onClick={() => analyzeDataWithAI('products')} disabled={isAnalyzing} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-all">
                      {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {isAnalyzing ? 'Auditing Generated CSV...' : 'Run Final Quality Audit'}
                    </button>
                  </div>

                  {prodMap.auditAdvice && prodMap.auditAdvice.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
                      <h3 className="text-amber-900 font-bold text-sm mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Senior Auditor Findings</h3>
                      <div className="space-y-3">
                        {prodMap.auditAdvice.map((advice, i) => (
                          <div key={i} className="flex items-start gap-3 text-sm p-3 bg-white/60 rounded-lg border border-amber-100">
                            {advice.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" /> : <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />}
                            <div><span className="font-bold text-amber-900 capitalize">{advice.field}: </span><span className="text-amber-800">{advice.message}</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 text-center shadow-sm">
                    <h3 className="text-lg font-bold mb-4">Final Results</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <button onClick={() => triggerChunkedDownload(prodData.final, prodData.headers || SHOPIFY_PRODUCT_HEADERS, 'shopify_products')} className="bg-gray-900 text-white p-6 rounded-xl flex flex-col items-center hover:bg-black transition-all shadow-md">
                        <ShoppingBag className="w-8 h-8 mb-2" />
                        <span className="font-bold text-lg">Download Products CSV</span>
                        <span className="text-xs text-gray-400 mt-1">{prodData.final?.length || 0} rows generated</span>
                      </button>
                      <button onClick={() => triggerDownload(prodData.redirects, REDIRECT_HEADERS, 'url_redirects.csv')} className="bg-white border-2 border-gray-100 p-6 rounded-xl flex flex-col items-center hover:border-indigo-200 transition-all shadow-sm">
                        <LinkIcon className="w-8 h-8 text-indigo-600 mb-2" />
                        <span className="font-bold text-lg">Download Redirects</span>
                        <span className="text-xs text-gray-400 mt-1">SEO Safety Net</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-6 border-t border-gray-100">
                    <button onClick={prevStep} className="text-gray-500 font-bold flex items-center gap-2 hover:text-gray-900"><ArrowRight className="w-4 h-4 rotate-180" /> Back to Mapping</button>
                    <div className="flex gap-4">
                      <button onClick={nextStep} className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-indigo-700 shadow-md flex items-center gap-2">
                        Continue to Reviews <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {flowStep === 4 && (
                <div className="animate-in fade-in">
                  <div className="bg-purple-50 border border-purple-100 rounded-2xl p-8 mb-8">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="p-3 bg-purple-500/20 rounded-xl"><MessageSquareQuote className="w-8 h-8 text-purple-600" /></div>
                      <div>
                        <h3 className="text-xl font-bold text-purple-900">Step 4: Product Reviews</h3>
                        <p className="text-purple-700 text-sm">Upload WooCommerce comments to generate Shopify-ready reviews.</p>
                      </div>
                    </div>

                    <div className="border-2 border-dashed border-purple-200 rounded-xl p-10 text-center bg-white hover:border-purple-400 transition-colors relative">
                      <input type="file" onChange={handleReviewsUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".csv, .xml" />
                      <div className="flex flex-col items-center">
                        <div className="bg-purple-100 p-4 rounded-full mb-4"><Upload className="w-8 h-8 text-purple-600" /></div>
                        <p className="font-bold text-purple-900 text-lg">Click to Upload Reviews CSV or XML</p>
                        <p className="text-sm text-purple-600 mt-1">WooCommerce "Comments" export</p>
                      </div>
                    </div>
                    {prodData.reviews && prodData.reviews.length > 0 && (
                      <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 font-bold">
                        <CheckCircle className="w-5 h-5" /> {prodData.reviews.length} Reviews parsed successfully!
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-6 border-t border-gray-100">
                    <button onClick={prevStep} className="text-gray-500 font-bold flex items-center gap-2 hover:text-gray-900"><ArrowRight className="w-4 h-4 rotate-180" /> Back to Audit</button>
                    <button onClick={nextStep} className="bg-green-600 text-white px-10 py-3 rounded-lg font-bold hover:bg-green-700 shadow-md">Complete Migration <ArrowRight className="w-4 h-4 ml-2" /></button>
                  </div>
                </div>
              )}

              {flowStep === 5 && (
                <div className="animate-in fade-in">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-8 text-center">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    <h3 className="text-xl font-bold text-green-900">Migration Blueprint Ready</h3>
                    <p className="text-green-700">All data generated and verified.</p>
                  </div>
                  <div className="flex flex-col items-center mb-8">
                    {prodData.reviews && prodData.reviews.length > 0 ? (
                      <div className="bg-white border-2 border-purple-200 p-10 rounded-2xl shadow-lg flex flex-col items-center text-center max-w-md w-full">
                        <div className="bg-purple-100 p-4 rounded-full mb-4"><MessageSquareQuote className="w-10 h-10 text-purple-600" /></div>
                        <h4 className="font-bold text-2xl text-gray-900 mb-1">Reviews Ready</h4>
                        <p className="text-sm text-gray-500 mb-6">{prodData.reviews.length} product reviews generated</p>
                        <button onClick={() => triggerDownload(prodData.reviews, REVIEW_HEADERS, 'shopify_reviews.csv')} className="w-full bg-purple-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-purple-700 shadow-md flex items-center justify-center gap-2 transition-all">
                          <Download className="w-5 h-5" /> Download Reviews CSV
                        </button>
                        <p className="text-[10px] text-purple-400 mt-4 uppercase font-bold tracking-wider">Product & Redirect files can be found in the Download Hub</p>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-6 w-full">
                        <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm flex flex-col items-center text-center">
                          <ShoppingBag className="w-10 h-10 text-blue-600 mb-3" />
                          <h4 className="font-bold text-gray-900">Products</h4>
                          <p className="text-xs text-gray-500 mb-4">{prodData.final?.length || 0} items mapped</p>
                          <button onClick={() => triggerDownload(prodData.final, prodData.headers || SHOPIFY_PRODUCT_HEADERS, 'shopify_products.csv')} className="w-full bg-blue-50 text-blue-700 py-2 rounded-lg font-bold text-sm hover:bg-blue-100">Download</button>
                        </div>
                        <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm flex flex-col items-center text-center">
                          <LinkIcon className="w-10 h-10 text-indigo-600 mb-3" />
                          <h4 className="font-bold text-gray-900">Redirects</h4>
                          <p className="text-xs text-gray-500 mb-4">SEO Safety Plan</p>
                          <button onClick={() => triggerDownload(prodData.redirects, REDIRECT_HEADERS, 'url_redirects.csv')} className="w-full bg-indigo-50 text-indigo-700 py-2 rounded-lg font-bold text-sm hover:bg-indigo-100">Download</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-900 rounded-2xl p-8 text-white flex items-center justify-between shadow-xl">
                    <div>
                      <h4 className="text-xl font-bold mb-1">Next: Customers & Orders</h4>
                      <p className="text-gray-400 text-sm">Proceed to migrate your user database and history.</p>
                    </div>
                    <button onClick={() => switchFlow('customers')} className="bg-white text-gray-900 px-6 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-100 transition-colors">
                      Start Customer Flow <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FLOW 2: CUSTOMERS */}
          {/* FLOW 2: CUSTOMERS */}
          {activeFlow === 'customers' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 min-h-[600px] animate-in fade-in duration-300">
              <div className="flex items-center gap-3 mb-6 border-b pb-4"><Users className="w-8 h-8 text-green-600" /><h2 className="text-2xl font-bold">Customers & Users Flow</h2></div>

              {flowStep === 1 && (
                <div className="text-center py-12">
                  <h3 className="text-xl font-bold mb-4">Step 1: Upload WooCommerce Customers</h3>
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current.click()}>
                    <input type="file" accept=".csv, .xml" className="hidden" ref={fileInputRef} onChange={(e) => handleFileUpload(e, 'customers')} />
                    <FileSpreadsheet className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">Click to upload Customers CSV or XML</p>
                  </div>
                </div>
              )}

              {flowStep === 2 && (
                <div className="animate-in fade-in">
                  <div className="bg-green-50 border border-green-100 rounded-2xl p-8 mb-8">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-green-500/20 rounded-xl"><Wand2 className="w-8 h-8 text-green-600" /></div>
                      <div><h3 className="text-xl font-bold text-green-900">Step 2: Customer Mapping</h3><p className="text-green-700 text-sm">Automated billing-to-address matching complete.</p></div>
                    </div>

                    <div className="border border-green-200 rounded-xl p-5 bg-white shadow-sm mb-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><Database className="w-5 h-5 text-indigo-600" /> Tier 1: Billing & Profile Map</h3>
                      <div className="grid md:grid-cols-3 gap-4">
                        {['first', 'last', 'email', 'phone', 'addr1', 'city', 'province', 'country', 'zip'].map(key => (
                          <div key={key} className="bg-gray-50 p-3 rounded border">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{key}</label>
                            <select value={custMap.core[key]} onChange={(e) => setCustMap(p => ({ ...p, core: { ...p.core, [key]: e.target.value } }))} className="w-full bg-transparent text-sm font-bold outline-none">
                              <option value="">-- Blank --</option>
                              {custData.cols.map(c => <option key={c} value={c}>{c} ({custData.colStats?.[c] || 0}%)</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>

                    {renderMetafieldsTable('customers', custMap)}
                    {renderJunkDrawer('customers', custData.cols, custMap)}

                    <div className="flex justify-between items-center pt-8 border-t border-gray-100">
                      <button onClick={() => setCustData(p => ({ ...p, raw: null }))} className="text-gray-500 font-bold px-4 py-2">Back</button>
                      <button onClick={() => { processCustomers(); }} disabled={isProcessing} className="bg-green-600 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-green-700 shadow-lg transition-all">
                        {isProcessing ? 'Generating...' : 'Generate & Audit Blueprint'} <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {flowStep === 3 && (
                <div className="animate-in fade-in">
                  <div className="bg-green-50 border border-green-100 rounded-2xl p-8 mb-8">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="p-3 bg-green-500/20 rounded-xl"><Wand2 className="w-8 h-8 text-green-600" /></div>
                      <div>
                        <h3 className="text-xl font-bold text-green-900">Step 3: Senior Data Audit</h3>
                        <p className="text-green-700 text-sm">Review the quality of your GENERATED Shopify file.</p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 bg-white/50 p-6 rounded-xl border border-green-100 mb-6">
                      <div>
                        <label className="block text-sm font-bold text-green-900 mb-2">Gemini API Key</label>
                        <input type="password" value={prodMap.apiKey} onChange={(e) => setProdMap(p => ({ ...p, apiKey: e.target.value }))} className="w-full px-3 py-2 rounded border border-green-200 text-sm outline-none shadow-inner" placeholder="AIzaSy..." />
                      </div>
                    </div>

                    <button onClick={() => analyzeDataWithAI('customers')} disabled={isAnalyzing} className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-all">
                      {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {isAnalyzing ? 'Auditing Generated CSV...' : 'Run Final Quality Audit'}
                    </button>
                  </div>

                  {custMap.auditAdvice && custMap.auditAdvice.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
                      <h3 className="text-amber-900 font-bold text-sm mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Senior Auditor Findings</h3>
                      <div className="space-y-3">
                        {custMap.auditAdvice.map((advice, i) => (
                          <div key={i} className="flex items-start gap-3 text-sm p-3 bg-white/60 rounded-lg border border-amber-100">
                            {advice.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" /> : <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />}
                            <div><span className="font-bold text-amber-900 capitalize">{advice.field}: </span><span className="text-amber-800">{advice.message}</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 text-center shadow-sm">
                    <h3 className="text-lg font-bold mb-4">Final Results</h3>
                    <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                      <button onClick={() => triggerChunkedDownload(custData.final, custData.headers, 'shopify_customers')} className="bg-gray-900 hover:bg-black text-white p-6 rounded-xl flex flex-col items-center justify-between font-bold shadow-md transition-all">
                        <Users className="w-8 h-8 mb-2" />
                        <span className="text-lg">Download Customers CSV</span>
                        <span className="text-xs text-gray-400 mt-1">{custData.final?.length || 0} rows generated</span>
                      </button>
                      <button onClick={() => downloadSchemaCSV('customers')} className="bg-white border-2 border-gray-100 hover:border-indigo-200 p-6 rounded-xl flex flex-col items-center justify-between font-bold text-gray-700 transition-all">
                        <LayoutTemplate className="w-8 h-8 text-indigo-600 mb-2" />
                        <span className="text-lg">Mapping Checklist</span>
                        <span className="text-xs text-gray-400 mt-1">For review</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-6 border-t border-gray-100">
                    <button onClick={prevStep} className="text-gray-500 font-bold flex items-center gap-2 hover:text-gray-900"><ArrowRight className="w-4 h-4 rotate-180" /> Back to Mapping</button>
                    <button onClick={() => switchFlow('orders')} className="bg-green-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-green-700 shadow-md flex items-center gap-2">
                      Proceed to Orders Flow <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}


          {/* FLOW 3: ORDERS */}
          {activeFlow === 'orders' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 min-h-[600px] animate-in fade-in duration-300">
              <div className="flex items-center gap-3 mb-6 border-b pb-4"><ShoppingCart className="w-8 h-8 text-purple-600" /><h2 className="text-2xl font-bold">Historical Orders Flow</h2></div>

              {flowStep === 1 && (
                <div className="text-center py-12">
                  <h3 className="text-xl font-bold mb-4">Step 1: Upload WooCommerce Orders</h3>
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current.click()}>
                    <input type="file" accept=".csv, .xml" className="hidden" ref={fileInputRef} onChange={(e) => handleFileUpload(e, 'orders')} />
                    <FileSpreadsheet className="w-12 h-12 text-purple-500 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">Click to upload Orders CSV or XML</p>
                  </div>
                </div>
              )}

              {flowStep === 2 && (
                <div className="animate-in fade-in">
                  <div className="bg-purple-50 border border-purple-100 rounded-2xl p-8 mb-8">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="p-3 bg-purple-500/20 rounded-xl"><FileBox className="w-8 h-8 text-purple-600" /></div>
                      <div><h3 className="text-xl font-bold text-purple-900">Step 2: Order Logic & Mapping</h3><p className="text-purple-700 text-sm">Select your execution mode and verify auto-mappings.</p></div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 mb-8">
                      <div onClick={() => setOrdMap(p => ({ ...p, mode: 'matrixify' }))} className={`border-2 rounded-xl p-6 cursor-pointer transition-colors bg-white ${ordMap.mode === 'matrixify' ? 'border-purple-600 shadow-md' : 'border-gray-200 hover:border-purple-300'}`}>
                        <FileBox className={`w-8 h-8 mb-3 ${ordMap.mode === 'matrixify' ? 'text-purple-600' : 'text-gray-400'}`} />
                        <h4 className="font-bold text-lg mb-2">Matrixify Template</h4>
                        <p className="text-sm text-gray-600">Maps data into a clean Matrixify Orders CSV format.</p>
                      </div>
                      <div onClick={() => setOrdMap(p => ({ ...p, mode: 'api' }))} className={`border-2 rounded-xl p-6 cursor-pointer transition-colors bg-white ${ordMap.mode === 'api' ? 'border-blue-600 shadow-md' : 'border-gray-200 hover:border-blue-300'}`}>
                        <Server className={`w-8 h-8 mb-3 ${ordMap.mode === 'api' ? 'text-blue-600' : 'text-gray-400'}`} />
                        <h4 className="font-bold text-lg mb-2">API Direct Sync</h4>
                        <p className="text-sm text-gray-600">Pushes orders directly into Shopify using Admin Token.</p>
                      </div>
                    </div>

                    <div className="border border-purple-200 rounded-xl p-5 bg-white shadow-sm mb-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-purple-600" /> Tier 1: Order Data Map</h3>
                      <div className="grid md:grid-cols-4 gap-4">
                        {['id', 'date', 'email', 'status', 'itemName', 'itemSku', 'itemQty', 'itemPrice'].map(key => (
                          <div key={key} className="bg-gray-50 p-3 rounded border">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{key}</label>
                            <select value={ordMap.core[key]} onChange={(e) => setOrdMap(p => ({ ...p, core: { ...p.core, [key]: e.target.value } }))} className="w-full bg-transparent text-sm font-bold outline-none">
                              <option value="">-- Blank --</option>
                              {ordData.cols.map(c => <option key={c} value={c}>{c} ({ordData.colStats?.[c] || 0}%)</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>

                    {renderMetafieldsTable('orders', ordMap)}
                    {renderJunkDrawer('orders', ordData.cols, ordMap)}

                    <div className="flex justify-between items-center pt-8 border-t border-gray-100">
                      <button onClick={() => setOrdData(p => ({ ...p, raw: null }))} className="text-gray-500 font-bold px-4 py-2">Back</button>
                      <button onClick={() => { processOrders(); }} disabled={isProcessing} className="bg-purple-600 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700 shadow-lg transition-all">
                        {isProcessing ? 'Generating...' : 'Generate & Audit Blueprint'} <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {flowStep === 3 && (
                <div className="animate-in fade-in">
                  <div className="bg-purple-50 border border-purple-200 rounded-2xl p-8 mb-8">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="p-3 bg-purple-500/20 rounded-xl"><Wand2 className="w-8 h-8 text-purple-600" /></div>
                      <div>
                        <h3 className="text-xl font-bold text-purple-900">Step 3: Senior Data Audit</h3>
                        <p className="text-purple-700 text-sm">Review the quality of your GENERATED Shopify file.</p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 bg-white/50 p-6 rounded-xl border border-purple-100 mb-6">
                      <div>
                        <label className="block text-sm font-bold text-purple-900 mb-2">Gemini API Key</label>
                        <input type="password" value={prodMap.apiKey} onChange={(e) => setProdMap(p => ({ ...p, apiKey: e.target.value }))} className="w-full px-3 py-2 rounded border border-purple-200 text-sm outline-none shadow-inner" placeholder="AIzaSy..." />
                      </div>
                    </div>

                    <button onClick={() => analyzeDataWithAI('orders')} disabled={isAnalyzing} className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-all">
                      {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {isAnalyzing ? 'Auditing Generated CSV...' : 'Run Final Quality Audit'}
                    </button>
                  </div>

                  {ordMap.auditAdvice && ordMap.auditAdvice.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
                      <h3 className="text-amber-900 font-bold text-sm mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Senior Auditor Findings</h3>
                      <div className="space-y-3">
                        {ordMap.auditAdvice.map((advice, i) => (
                          <div key={i} className="flex items-start gap-3 text-sm p-3 bg-white/60 rounded-lg border border-amber-100">
                            {advice.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" /> : <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />}
                            <div><span className="font-bold text-amber-900 capitalize">{advice.field}: </span><span className="text-amber-800">{advice.message}</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 text-center shadow-sm">
                    <h3 className="text-lg font-bold mb-4">Final Results</h3>
                    
                    {ordMap.mode === 'matrixify' ? (
                      <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                        <button onClick={() => triggerDownload(ordData.final, ordData.headers, 'matrixify_orders.csv')} className="bg-gray-900 hover:bg-black text-white p-6 rounded-xl flex flex-col items-center justify-between font-bold shadow-md transition-all">
                          <FileBox className="w-8 h-8 mb-2" />
                          <span className="text-lg">Download Matrixify CSV</span>
                          <span className="text-xs text-gray-400 mt-1">{ordData.final?.length || 0} rows generated</span>
                        </button>
                        <button onClick={() => downloadSchemaCSV('orders')} className="bg-white border-2 border-gray-100 hover:border-indigo-200 p-6 rounded-xl flex flex-col items-center justify-between font-bold text-gray-700 transition-all">
                          <LayoutTemplate className="w-8 h-8 text-indigo-600 mb-2" />
                          <span className="text-lg">Mapping Checklist</span>
                          <span className="text-xs text-gray-400 mt-1">For review</span>
                        </button>
                      </div>
                    ) : (
                      <div className="max-w-2xl mx-auto">
                        <button onClick={() => setFlowStep(4)} className="w-full bg-blue-600 hover:bg-blue-700 text-white p-6 rounded-xl flex flex-col items-center justify-center gap-2 font-bold shadow-md transition-all">
                          <Play className="w-8 h-8 mb-2" />
                          <span className="text-lg">Open API Sync Console</span>
                          <span className="text-xs text-blue-200 mt-1">Push directly to Shopify</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-6 border-t border-gray-100">
                    <button onClick={prevStep} className="text-gray-500 font-bold flex items-center gap-2 hover:text-gray-900"><ArrowRight className="w-4 h-4 rotate-180" /> Back to Mapping</button>
                    <button onClick={() => switchFlow('seo')} className="bg-purple-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-purple-700 shadow-md flex items-center gap-2">
                      Proceed to Launch <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {flowStep === 4 && ordMap.mode === 'api' && (
                <div className="animate-in fade-in max-w-4xl mx-auto">
                  {!syncProgress.active && !syncProgress.complete ? (
                    <div className="grid md:grid-cols-2 gap-8">
                      <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
                        <h3 className="text-xl font-bold mb-2">Shopify API Connection</h3>
                        <p className="text-gray-600 text-sm mb-6">Enter a Custom App Admin Token to push orders directly to your store.</p>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4"><h4 className="font-bold text-blue-900 text-sm mb-2 flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Simulation Mode Only</h4><p className="text-xs text-blue-800">Clicking the Dry-Run button below will run a safe frontend simulation.</p></div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6"><h4 className="font-bold text-blue-900 text-sm mb-2 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> API Safety Guardrails Active</h4><ul className="text-xs text-blue-800 space-y-1"><li>• <strong>Silent Import:</strong> `send_receipt` and `send_fulfillment_receipt` forced to FALSE.</li><li>• <strong>Inventory Bypassing:</strong> `inventory_behaviour` forced to "bypass".</li><li>• <strong>Rate Limiting:</strong> Engine throttled to 2 req/sec.</li></ul></div>
                        <div className="space-y-4 mb-8">
                          <div><label className="block text-sm font-bold text-gray-700 mb-1">Store URL</label><div className="flex items-center gap-2 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2"><Globe className="w-4 h-4 text-gray-400" /><input type="text" placeholder="your-store.myshopify.com" className="bg-transparent outline-none w-full text-sm font-medium" /></div></div>
                          <div><label className="block text-sm font-bold text-gray-700 mb-1">Admin API Access Token</label><div className="flex items-center gap-2 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2"><Key className="w-4 h-4 text-gray-400" /><input type="password" placeholder="shpat_..." className="bg-transparent outline-none w-full text-sm font-mono" /></div></div>
                        </div>
                        <button onClick={handleSimulateApiSync} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg"><Play className="w-4 h-4" /> Start Direct Sync Dry-Run</button>
                      </div>
                      <div className="bg-gray-900 rounded-xl p-6 shadow-sm overflow-hidden flex flex-col">
                        <h3 className="text-white font-bold mb-2 flex items-center gap-2"><Database className="w-4 h-4" /> JSON Payload Preview</h3>
                        <p className="text-gray-400 text-xs mb-4">Review the assembled API data for the first order before executing the simulated sync.</p>
                        <div className="bg-gray-800 rounded-lg p-4 flex-1 overflow-y-auto max-h-[400px]">
                          <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap">
                            {ordData.final && ordData.final.length > 0 ? JSON.stringify(ordData.final[0], null, 2) : '// No order data mapped'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm text-center">
                      {syncProgress.complete ? <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" /> : <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />}
                      <h3 className="text-2xl font-bold mb-2">{syncProgress.complete ? 'Simulation Complete' : 'Executing Simulated Sync...'}</h3>
                      <p className="text-gray-500 mb-8">{syncProgress.current} / {syncProgress.total} Orders Processed</p>
                      <div className="w-full bg-gray-100 rounded-full h-4 mb-8 overflow-hidden relative">
                        <div className="bg-blue-600 h-4 transition-all duration-300" style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}></div>
                      </div>
                      {syncProgress.complete && (<button onClick={() => switchFlow('seo')} className="bg-gray-900 text-white px-6 py-3 rounded-lg font-bold inline-flex items-center gap-2">Proceed to Test Batch & Launch <ArrowRight className="w-4 h-4" /></button>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* FLOW 4: TEST BATCH & LAUNCH */}
          {activeFlow === 'seo' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 min-h-[600px] animate-in fade-in duration-300">
              <div className="flex items-center gap-3 mb-6 border-b pb-4"><Search className="w-8 h-8 text-orange-600" /><h2 className="text-2xl font-bold">Test Batch & Launch</h2></div>

              {prodData.final && custData.final && ordData.final && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8 shadow-sm">
                  <div className="text-center mb-6">
                    <h3 className="font-bold text-blue-900 mb-2 text-lg">Relational Test Batch Generator</h3>
                    <p className="text-sm text-blue-800 max-w-2xl mx-auto leading-relaxed">
                      The engine has successfully held Products, Customers, and Orders in memory. It will extract 20 random orders, isolate the specific buyers, and grab only the exact products purchased for a perfect 1-to-1 sync test.
                    </p>
                  </div>

                  {!testBatchData ? (
                    <div className="text-center">
                      <button
                        onClick={handleGenerateTestBatch}
                        disabled={isGeneratingTestBatch}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold inline-flex items-center gap-2 transition-colors disabled:opacity-50 shadow-md"
                      >
                        {isGeneratingTestBatch ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
                        {isGeneratingTestBatch ? 'Compiling Sync Batch...' : 'Generate 20-Order Sync Batch'}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                      <button onClick={() => triggerDownload(testBatchData.products, prodData.headers || SHOPIFY_PRODUCT_HEADERS, 'test_batch_products.csv')} className="bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 py-3 rounded-lg text-sm font-bold flex flex-col items-center gap-1 shadow-sm"><ShoppingBag className="w-5 h-5" /> {testBatchData.products.length} Products</button>
                      <button onClick={() => triggerDownload(testBatchData.customers, custData.headers, 'test_batch_customers.csv')} className="bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 py-3 rounded-lg text-sm font-bold flex flex-col items-center gap-1 shadow-sm"><Users className="w-5 h-5" /> {testBatchData.customers.length} Customers</button>
                      <button onClick={() => {
                        if (testBatchData.isMatrixify) { triggerDownload(testBatchData.orders, ordData.headers, 'test_batch_orders.csv'); }
                        else { const blob = new Blob([JSON.stringify(testBatchData.orders, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'test_batch_api_orders.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
                      }} className="bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 py-3 rounded-lg text-sm font-bold flex flex-col items-center gap-1 shadow-sm"><ShoppingCart className="w-5 h-5" /> {testBatchData.orders.length} Orders</button>
                      {testBatchData.reviews && testBatchData.reviews.length > 0 && (
                        <button onClick={() => triggerDownload(testBatchData.reviews, REVIEW_HEADERS, 'test_batch_reviews.csv')} className="bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 py-3 rounded-lg text-sm font-bold flex flex-col items-center gap-1 shadow-sm"><MessageSquareQuote className="w-5 h-5" /> {testBatchData.reviews.length} Reviews</button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-8">
                <h3 className="font-bold text-orange-900 mb-3">Final Pre-Flight Checklist</h3>
                <ul className="space-y-3 text-sm text-orange-800">
                  <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> Import URL Redirects CSV via Navigation settings.</li>
                  <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> Connect custom domain and ensure SSL is active.</li>
                  <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> Submit new sitemap.xml to Google Search Console to preserve rankings.</li>
                </ul>
              </div>

              <div className="text-center py-12"><h2 className="text-3xl font-bold text-gray-900 mb-4">Migration Complete!</h2><p className="text-gray-500 max-w-md mx-auto">You have successfully transformed WooCommerce Products, Customers, and Orders into native Shopify architecture.</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}