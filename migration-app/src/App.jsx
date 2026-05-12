import React, { useState, useRef } from 'react';
import {
  Upload,
  ArrowRight,
  CheckCircle,
  FileSpreadsheet,
  Settings,
  Download,
  AlertTriangle,
  Users,
  ShoppingBag,
  Search,
  Link as LinkIcon,
  ShoppingCart,
  MessageSquareQuote,
  Wand2,
  Sparkles,
  Loader2,
  Check,
  Globe,
  ShieldCheck,
  Database,
  LayoutTemplate,
  X,
  FileBox,
  Scissors,
  ChevronDown,
  ChevronUp,
  Plus
} from 'lucide-react';

// --- Utility: CSV Parser ---
const parseCSV = (str) => {
  const arr = [];
  let quote = false;
  let col = 0, row = 0;
  for (let c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c + 1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || '';

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

const unparseCSV = (data, headers) => {
  if (data.length === 0) return '';
  const rows = data.map(row =>
    headers.map(header => {
      let cell = row[header] === null || row[header] === undefined ? '' : String(row[header]);
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

// --- Utility: Text Cleaners & Formatters ---
const cleanText = (str) => {
  if (!str) return '';
  let text = str
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '')
    .replace(/\\/g, '')
    .replace(/>\s*\n\s*</g, '><') // Strip invisible line breaks between HTML tags
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]*>?/gm, '');

  return text
    .replace(/([•\-*])\s*\n\s*/g, '$1 ') // Snap floating bullets back
    .replace(/\n{3,}/g, '\n\n')
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
  if (sections.length === 0) return { main: formatBlock(cleanText(text)), meta: {} };

  const cleanDesc = cleanText(text);
  const escaped = sections.map(s => s.heading.replace(/[:\s]+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})[:\\s]*`, 'gi');
  const parts = cleanDesc.split(regex);

  const result = { main: '', meta: {} };

  if (parts[0] && parts[0].trim()) {
    result.main = formatBlock(parts[0]);
  }

  for (let i = 1; i < parts.length; i += 2) {
    let h = parts[i].trim().replace(/[:\s]+$/, '');
    let content = parts[i + 1] ? parts[i + 1] : '';
    const sectionDef = sections.find(s => h.toLowerCase() === s.heading.replace(/[:\s]+$/, '').toLowerCase());

    if (sectionDef && sectionDef.shopifyMeta) {
      result.meta[sectionDef.shopifyMeta] = content.trim();
    }
  }
  return result;
};

const buildSmartHtml = (rawShort, rawLong, headings = []) => {
  let html = '';
  const shortClean = cleanText(rawShort);
  const longClean = cleanText(rawLong);

  if (shortClean) html += `<h3>Quick Overview</h3>${formatBlock(shortClean)}`;

  if (headings && headings.length > 0 && longClean) {
    const escaped = headings.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = longClean.split(regex);

    if (parts[0] && parts[0].trim()) {
      if (shortClean) html += `<h3>Product Details</h3>`;
      html += formatBlock(parts[0]);
    }

    for (let i = 1; i < parts.length; i += 2) {
      let h = parts[i].trim().replace(/:$/, '');
      let content = parts[i + 1] ? parts[i + 1] : '';
      html += `<h3>${h}</h3>${formatBlock(content)}`;
    }
  } else if (longClean) {
    if (shortClean) html += `<h3>Product Details</h3>`;
    html += formatBlock(longClean);
  }
  return html;
};

const calculateWeight = (row) => {
  let weight = 0;
  if (row['Weight (kg)']) weight = parseFloat(row['Weight (kg)']) * 1000;
  else if (row['Weight (lbs)']) weight = parseFloat(row['Weight (lbs)']) * 453.592;
  else if (row['Weight (g)']) weight = parseFloat(row['Weight (g)']);
  else if (row['Weight (oz)']) weight = parseFloat(row['Weight (oz)']) * 28.3495;
  return isNaN(weight) || weight === 0 ? '' : weight;
};

// Standard Shopify Headers
const BASE_SHOPIFY_HEADERS = [
  'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags', 'Published on online store', 'Status',
  'SKU', 'Barcode', 'Option1 name', 'Option1 value', 'Option1 Linked To', 'Option2 name', 'Option2 value', 'Option2 Linked To',
  'Option3 name', 'Option3 value', 'Option3 Linked To', 'Price', 'Compare-at price', 'Cost per item', 'Charge tax', 'Tax code',
  'Unit price total measure', 'Unit price total measure unit', 'Unit price base measure', 'Unit price base measure unit',
  'Inventory tracker', 'Inventory quantity', 'Continue selling when out of stock', 'Weight value (grams)', 'Weight unit for display',
  'Requires shipping', 'Fulfillment service', 'Product image URL', 'Image position', 'Image alt text', 'Variant image URL',
  'Gift card', 'SEO title', 'SEO description'
];

// Columns that inherently map to Shopify's standard base headers
const KNOWN_WOO_BASE_COLS = [
  'Name', 'SKU', 'Published', 'Tax status', 'Manage stock?', 'Stock', 'Backorders allowed?',
  'Sale price', 'Regular price', 'Images', 'Weight (kg)', 'Weight (lbs)', 'Weight (g)', 'Weight (oz)',
  'Type', 'Parent', 'Attribute 1 name', 'Attribute 1 value(s)', 'Attribute 2 name', 'Attribute 2 value(s)',
  'Attribute 3 name', 'Attribute 3 value(s)'
];

const REDIRECT_HEADERS = ['Redirect from', 'Redirect to'];
const REVIEW_HEADERS = ['product_handle', 'rating', 'title', 'author', 'email', 'body', 'created_at'];

export default function App() {
  const [currentStep, setCurrentStep] = useState(0);

  const [wooCsvData, setWooCsvData] = useState(null);
  const [wooColumns, setWooColumns] = useState([]);
  const [shopifyCsvData, setShopifyCsvData] = useState(null);
  const [dynamicShopifyHeaders, setDynamicShopifyHeaders] = useState(BASE_SHOPIFY_HEADERS);
  const [redirectsCsvData, setRedirectsCsvData] = useState(null);

  const [wooReviewsData, setWooReviewsData] = useState(null);
  const [shopifyReviewsData, setShopifyReviewsData] = useState(null);
  const [reviewsFileName, setReviewsFileName] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState(null);
  const [aiError, setAiError] = useState('');
  const [sampleProductUrl, setSampleProductUrl] = useState('');

  const [isValidating, setIsValidating] = useState(false);
  const [validationReport, setValidationReport] = useState(null);
  const [validationError, setValidationError] = useState('');

  const [storeVendor, setStoreVendor] = useState('My Store');
  const [generateRedirects, setGenerateRedirects] = useState(true);
  const [permalinkPrefix, setPermalinkPrefix] = useState('/product/');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const [showRejectedCols, setShowRejectedCols] = useState(false);
  const [rejectedSearch, setRejectedSearch] = useState('');

  const [newMeta, setNewMeta] = useState({ wooCol: '', name: '', shopifyMeta: '', type: 'single_line_text_field' });

  const [aiMapping, setAiMapping] = useState({
    coreMappings: {
      descriptionCol: 'Description',
      shortDescriptionCol: 'Short description',
      categoriesCol: 'Categories',
      tagsCol: 'Tags',
      vendorCol: ''
    },
    metafields: [],
    descriptionStrategy: 'extract-metafields',
    descriptionHeadings: [],
    extractedSections: [],
    categoryStrategy: 'safe-type',
    handleStrategy: 'sku'
  });

  const fileInputRef = useRef(null);
  const reviewsInputRef = useRef(null);

  const steps = [
    { id: 'intro', title: 'Preparation', icon: <CheckCircle className="w-5 h-5" /> },
    { id: 'upload', title: 'Upload Products', icon: <Upload className="w-5 h-5" /> },
    { id: 'ai-analysis', title: 'Data Model Blueprint', icon: <FileBox className="w-5 h-5" /> },
    { id: 'validate-download', title: 'Validate & Download', icon: <ShieldCheck className="w-5 h-5" /> },
    { id: 'orders', title: 'Historical Orders', icon: <ShoppingCart className="w-5 h-5" /> },
    { id: 'reviews', title: 'Product Reviews', icon: <MessageSquareQuote className="w-5 h-5" /> },
    { id: 'customers', title: 'Customers & Accounts', icon: <Users className="w-5 h-5" /> },
    { id: 'seo', title: 'SEO & Launch', icon: <Search className="w-5 h-5" /> },
  ];

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsed = parseCSV(text);
      const headers = parsed[0].map(h => h.trim());
      setWooColumns(headers);

      const rows = parsed.slice(1).filter(row => row.length > 1 || row[0] !== '').map(row => {
        const obj = {};
        headers.forEach((header, i) => { obj[header] = row[i]; });
        return obj;
      });

      setWooCsvData(rows);
      setIsProcessing(false);
      setCurrentStep(2);
      setAiReport(null);
      setAiError('');
      setValidationReport(null);
      setValidationError('');
    };
    reader.readAsText(file);
  };

  const analyzeDataWithAI = async () => {
    if (!wooCsvData || wooCsvData.length === 0) return;
    setIsAnalyzing(true);
    setAiError('');

    // --- GOLDEN SAMPLE ALGORITHM ---
    const primaryRows = wooCsvData.filter(r => !(r.Type || '').toLowerCase().includes('variation'));
    const pool = primaryRows.length > 0 ? primaryRows : wooCsvData;

    const sortedByDesc = [...pool].sort((a, b) => {
      const lenA = (a.Description || '').length;
      const lenB = (b.Description || '').length;
      return lenB - lenA;
    });
    const top10Desc = sortedByDesc.slice(0, 10);

    const countMeta = (row) => Object.keys(row).filter(k =>
      (k.toLowerCase().includes('meta:') || k.toLowerCase().includes('attribute')) && row[k]
    ).length;

    const sortedByMeta = [...pool].sort((a, b) => countMeta(b) - countMeta(a));
    const top20Meta = sortedByMeta.slice(0, 20);

    const stratified = [];
    const interval = Math.max(1, Math.floor(pool.length / 20));
    for (let i = 0; i < pool.length; i += interval) {
      if (stratified.length < 20) stratified.push(pool[i]);
    }

    const combinedSet = new Set([...top10Desc, ...top20Meta, ...stratified]);
    const goldenSampleRows = Array.from(combinedSet);

    const sampleData = {
      headers: wooColumns,
      rows: goldenSampleRows
    };

    const apiKey = "";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    let urlContext = "";
    if (sampleProductUrl) {
      urlContext = `\nCRITICAL CONTEXT: Live product link: ${sampleProductUrl}. Use Google Search to compare the rendered live page against the raw CSV data. Find the specific vendor/brand shown on the page and match it exactly to the data in the rows.`;
    }

    const promptText = `
      You are an expert Shopify migration Data Architect. Analyze this highly-optimized "Golden Sample" of a WooCommerce product export.
      We have pre-filtered this sample to contain the longest descriptions, the most metadata, and an even distribution of the entire catalog.
      Your job is to build a formal TWO-TIER Data Model for Shopify 2.0 based on the actual DATA INTENT.
      ${urlContext}
      
      CRITICAL TASKS:
      1. Intelligent Core Mappings: DO NOT blindly map headers based on generic names. Look at the ACTUAL DATA in the rows. 
         - For Vendor/Brand: DO NOT select a generic 'Brands' column if a dedicated feed column exists. Look explicitly for "Google product feed: Brand", "Meta: ps_google_product_feed_brand", or similar. WooCommerce almost always stores the true brand here.
      2. Metafield Schema (Columns): Find ALL valuable custom columns (e.g. 'Meta: materials'). Define a formal Metafield Schema.
         - 'name': Create a CLEAN, human-readable name based strictly on the ACTUAL VALUES in the column. If the header says 'Hair Concern' but the values are '30ml, 200ml', name it 'Size/Volume'. DO NOT blindly trust the header if the data contradicts it!
         - 'shopifyMeta': Create a clean, standard key (format: product.metafields.custom.clean_key_name).
         - 'type': MUST be one of Shopify's exact types: 'single_line_text_field', 'multi_line_text_field', 'number_integer', 'number_decimal', or 'boolean'.
         - CRITICAL OVERRIDE: You MUST blindly extract ANY 'Short description', 'Subtitle' (like 'Meta: ps_subtitle'), or 'SEO' related columns (like 'SEO title') into the Metafield Schema. Merchants require these as standalone dynamic block sources, even if they are mapped in Tier 1!
      3. Section Extraction: Scan the text inside the main Description column for standard Shopify modular content. Shopify 2.0 relies on Collapsible Rows for things like:
         - "FAQ" or "Frequently Asked Questions"
         - "Ingredients", "Materials", or "Specifications"
         - "How to Use" or "Care Instructions"
         - "Shipping" or "Returns"
         If you see these (or similar) as recurring internal headings, populate the 'extractedSections' array with the exact 'heading' string, and generate a 'shopifyMeta' key for it (e.g. 'product.metafields.custom.faq').
      4. Recommend 'extract-metafields' for the descriptionStrategy to execute this extraction.
      5. Recommend 'safe-type' for categoryStrategy.
      
      Data Sample: ${JSON.stringify(sampleData)}
    `;

    const payload = {
      contents: [{ parts: [{ text: promptText }] }],
      tools: [{ google_search: {} }],
      systemInstruction: { parts: [{ text: "Respond ONLY with valid JSON." }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            analysisSummary: { type: "STRING" },
            strategicRationale: { type: "ARRAY", items: { type: "STRING" } },
            orchestrationPlan: {
              type: "OBJECT",
              properties: {
                coreMappings: {
                  type: "OBJECT",
                  properties: {
                    vendorCol: { type: "STRING" },
                    descriptionCol: { type: "STRING" },
                    shortDescriptionCol: { type: "STRING" },
                    categoriesCol: { type: "STRING" },
                    tagsCol: { type: "STRING" }
                  }
                },
                metafields: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      wooCol: { type: "STRING" },
                      name: { type: "STRING" },
                      shopifyMeta: { type: "STRING" },
                      type: { type: "STRING" }
                    }
                  }
                },
                extractedSections: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      heading: { type: "STRING" },
                      shopifyMeta: { type: "STRING" }
                    }
                  }
                },
                descriptionStrategy: { type: "STRING" },
                categoryStrategy: { type: "STRING" },
                handleStrategy: { type: "STRING" }
              }
            }
          }
        }
      }
    };

    let retries = 0;
    const delays = [1000, 2000, 4000, 8000];

    while (retries < 5) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        const parsedReport = JSON.parse(text);
        setAiReport(parsedReport);

        if (parsedReport.orchestrationPlan) {
          setAiMapping(prev => ({
            ...prev,
            coreMappings: {
              ...prev.coreMappings,
              ...parsedReport.orchestrationPlan.coreMappings
            },
            metafields: parsedReport.orchestrationPlan.metafields || [],
            extractedSections: parsedReport.orchestrationPlan.extractedSections || [],
            descriptionStrategy: parsedReport.orchestrationPlan.descriptionStrategy || 'extract-metafields',
            categoryStrategy: parsedReport.orchestrationPlan.categoryStrategy || 'safe-type',
            handleStrategy: parsedReport.orchestrationPlan.handleStrategy || 'sku'
          }));
        }
        setIsAnalyzing(false);
        return;
      } catch (error) {
        if (retries === 4) {
          setAiError("Failed to complete AI analysis. You can configure the mappings manually.");
          setIsAnalyzing(false);
        }
        await new Promise(r => setTimeout(r, delays[retries]));
        retries++;
      }
    }
  };

  const runPreFlightValidation = async (dataToValidate = shopifyCsvData) => {
    if (!dataToValidate || dataToValidate.length === 0) return;
    setIsValidating(true);
    setValidationError('');

    const sampleData = {
      headers: dynamicShopifyHeaders,
      rows: dataToValidate.slice(0, 50).map((r, i) => ({ _index: i, ...r }))
    };

    const apiKey = "";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const promptText = `
      You are a strict Shopify CSV Import Validator. Analyze this generated Shopify CSV.
      
      CRITICAL CHECKS:
      1. HTML Validation: The 'Description' column SHOULD have clean HTML like <h3>, <p>, <ul>. DO NOT fail for these tags. Fail ONLY if there are literal unparsed '\\n' characters floating around.
      2. Metafields: Verify any 'product.metafields.namespace.key' columns are populated correctly based on the headers.
      3. Taxonomy: If 'Product category' is blank and 'Type' is populated, this is a PASS. If 'Product category' has arbitrary data, throw a WARNING.
      
      Generated Data Sample: ${JSON.stringify(sampleData)}
    `;

    const payload = {
      contents: [{ parts: [{ text: promptText }] }],
      systemInstruction: { parts: [{ text: "Respond ONLY with valid JSON." }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            status: { type: "STRING", description: "'success' or 'error'" },
            summary: { type: "STRING" },
            details: { type: "ARRAY", items: { type: "STRING" } }
          }
        }
      }
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      setValidationReport(JSON.parse(text));
    } catch (error) {
      setValidationError("Validation failed. You can still download the files.");
    } finally {
      setIsValidating(false);
    }
  };

  const processMapping = () => {
    setIsProcessing(true);

    setTimeout(() => {
      const shopifyFormat = [];
      const redirectsFormat = [];

      const newHeaders = [...BASE_SHOPIFY_HEADERS];
      if (aiMapping.metafields && aiMapping.metafields.length > 0) {
        aiMapping.metafields.forEach(meta => {
          if (meta.shopifyMeta && !newHeaders.includes(meta.shopifyMeta)) {
            newHeaders.push(meta.shopifyMeta);
          }
        });
      }
      if (aiMapping.descriptionStrategy === 'extract-metafields' && aiMapping.extractedSections) {
        aiMapping.extractedSections.forEach(sec => {
          if (sec.shopifyMeta && !newHeaders.includes(sec.shopifyMeta)) {
            newHeaders.push(sec.shopifyMeta);
          }
        });
      }

      setDynamicShopifyHeaders(newHeaders);

      const baseTemplate = newHeaders.reduce((acc, curr) => ({ ...acc, [curr]: '' }), {});

      const productsMap = new Map();
      const variations = [];

      wooCsvData.forEach(row => {
        const typeStr = (row['Type'] || '').toLowerCase();
        const isVariation = typeStr.includes('variation');
        const isVariable = typeStr.includes('variable');

        if (!isVariation && (typeStr.includes('simple') || typeStr.includes('bundle') || isVariable || (typeStr === '' && row['Name']))) {
          productsMap.set(row['ID'], { ...row, variants: [], isVariable: isVariable });
        } else if (isVariation) {
          variations.push(row);
        }
      });

      variations.forEach(v => {
        let parentId = v['Parent'] || '';
        if (parentId.startsWith('id:')) parentId = parentId.replace('id:', '').trim();
        const parent = productsMap.get(parentId) || Array.from(productsMap.values()).find(p => p['SKU'] === parentId || p['SKU'] === v['Parent']);
        if (parent) parent.variants.push(v);
      });

      productsMap.forEach(parent => {
        const title = parent['Name'] || 'Untitled Product';
        const parentSku = parent['SKU'] ? parent['SKU'].trim() : '';
        const handle = (aiMapping.handleStrategy === 'sku' && parentSku) ? slugify(parentSku) : slugify(title);

        const wooShortCol = aiMapping.coreMappings.shortDescriptionCol || 'Short description';
        const wooDescCol = aiMapping.coreMappings.descriptionCol || 'Description';

        const wooShort = parent[wooShortCol] || '';
        const wooDesc = parent[wooDescCol] || '';

        let finalDescription = '';
        let extractedMetaData = {};

        if (aiMapping.descriptionStrategy === 'extract-metafields') {
          const extraction = extractSectionsToMetafields(wooDesc, aiMapping.extractedSections || []);

          if (wooShort) finalDescription += formatBlock(cleanText(wooShort));
          if (extraction.main) finalDescription += extraction.main;

          extractedMetaData = extraction.meta;

        } else if (aiMapping.descriptionStrategy === 'accordion') {
          finalDescription = buildSmartHtml(wooShort, wooDesc, aiMapping.descriptionHeadings);
        } else if (aiMapping.descriptionStrategy === 'merge') {
          finalDescription = `${wooShort ? `<p>${extractPlainTextForSeo(wooShort)}</p>` : ''}${buildSmartHtml('', wooDesc, [])}`;
        } else {
          finalDescription = extractPlainTextForSeo(wooDesc);
        }

        let seoTitle = extractPlainTextForSeo(wooShort).substring(0, 70) || title;
        const seoDescription = extractPlainTextForSeo(wooDesc).substring(0, 320);

        let finalVendor = storeVendor;
        if (aiMapping.coreMappings.vendorCol && parent[aiMapping.coreMappings.vendorCol]) {
          finalVendor = parent[aiMapping.coreMappings.vendorCol];
        }

        const categoryCol = aiMapping.coreMappings.categoriesCol || 'Categories';
        const rawCategories = parent[categoryCol] || '';
        const categoryArray = rawCategories.split(',').map(c => c.trim()).filter(Boolean);

        let productCategory = '';
        let customType = '';

        const tagsCol = aiMapping.coreMappings.tagsCol || 'Tags';
        let tags = parent[tagsCol] || '';

        if (aiMapping.categoryStrategy === 'safe-type') {
          const primaryPath = categoryArray.length > 0 ? categoryArray[0] : '';
          customType = primaryPath ? primaryPath.split('>').pop().trim() : '';
          const allTags = new Set();
          categoryArray.forEach(path => path.split('>').forEach(node => allTags.add(node.trim())));
          const originalTags = parent[tagsCol] ? parent[tagsCol].split(',').map(t => t.trim()) : [];
          tags = Array.from(new Set([...allTags, ...originalTags])).filter(Boolean).join(', ');
        } else if (aiMapping.categoryStrategy === 'strict-category') {
          productCategory = categoryArray.length > 0 ? categoryArray[0] : '';
          customType = productCategory ? productCategory.split('>').pop().trim() : '';
          const extraTags = new Set();
          categoryArray.slice(1).forEach(path => path.split('>').forEach(node => extraTags.add(node.trim())));
          const originalTags = parent[tagsCol] ? parent[tagsCol].split(',').map(t => t.trim()) : [];
          tags = Array.from(new Set([...extraTags, ...originalTags])).filter(Boolean).join(', ');
        } else {
          const wooCategoryTags = new Set();
          categoryArray.forEach(path => path.split('>').forEach(node => wooCategoryTags.add(node.trim())));
          const originalTags = parent[tagsCol] ? parent[tagsCol].split(',').map(t => t.trim()) : [];
          tags = Array.from(new Set([...wooCategoryTags, ...originalTags])).filter(Boolean).join(', ');
        }

        if (generateRedirects) {
          let prefix = permalinkPrefix.trim();
          if (!prefix.startsWith('/')) prefix = '/' + prefix;
          if (!prefix.endsWith('/')) prefix = prefix + '/';
          redirectsFormat.push({ 'Redirect from': `${prefix}${handle}`, 'Redirect to': `/products/${handle}` });
        }

        const getBaseDetails = () => {
          const details = {
            'Title': title,
            'Description': finalDescription,
            'Vendor': finalVendor,
            'Product category': productCategory,
            'Type': customType,
            'Tags': tags,
            'Published on online store': parent['Published'] === '1' ? 'TRUE' : 'FALSE',
            'Status': parent['Published'] === '1' ? 'active' : 'draft',
            'Gift card': 'FALSE',
            'SEO title': seoTitle,
            'SEO description': seoDescription,
          };

          if (aiMapping.metafields && aiMapping.metafields.length > 0) {
            aiMapping.metafields.forEach(meta => {
              if (meta.shopifyMeta && parent[meta.wooCol]) {
                details[meta.shopifyMeta] = cleanText(parent[meta.wooCol]);
              }
            });
          }
          Object.keys(extractedMetaData).forEach(key => {
            details[key] = extractedMetaData[key];
          });

          return details;
        };

        const parentImages = parent['Images'] ? parent['Images'].split(',').map(i => i.trim()).filter(Boolean) : [];
        let imagePosCounter = 1;
        const trackedImages = new Set();

        if (!parent.isVariable || parent.variants.length === 0) {
          const price = parent['Sale price'] || parent['Regular price'] || '';
          const compareAtPrice = parent['Sale price'] ? parent['Regular price'] : '';
          const isVirtual = (parent['Type'] || '').toLowerCase().match(/virtual|downloadable/);

          const primaryRow = {
            ...baseTemplate,
            'URL handle': handle,
            ...getBaseDetails(),
            'Option1 name': 'Title',
            'Option1 value': 'Default Title',
            'SKU': parentSku,
            'Weight value (grams)': calculateWeight(parent),
            'Inventory tracker': parent['Manage stock?'] === 'yes' ? 'shopify' : '',
            'Inventory quantity': parent['Stock'] || '',
            'Continue selling when out of stock': parent['Backorders allowed?'] === 'yes' ? 'continue' : 'deny',
            'Fulfillment service': 'manual',
            'Price': price,
            'Compare-at price': compareAtPrice,
            'Requires shipping': isVirtual ? 'FALSE' : 'TRUE',
            'Charge tax': parent['Tax status'] === 'taxable' ? 'TRUE' : 'FALSE',
          };

          if (parentImages.length > 0) {
            primaryRow['Product image URL'] = parentImages[0];
            primaryRow['Image position'] = String(imagePosCounter++);
            trackedImages.add(parentImages[0]);
          }
          shopifyFormat.push(primaryRow);

          parentImages.forEach(img => {
            if (!trackedImages.has(img)) {
              shopifyFormat.push({ ...baseTemplate, 'URL handle': handle, 'Product image URL': img, 'Image position': String(imagePosCounter++) });
              trackedImages.add(img);
            }
          });

        } else {
          let isFirstVariant = true;
          parent.variants.forEach((variant, vIndex) => {
            const price = variant['Sale price'] || variant['Regular price'] || parent['Sale price'] || parent['Regular price'] || '';
            const compareAtPrice = variant['Sale price'] ? variant['Regular price'] : '';
            const isVirtual = (variant['Type'] || '').toLowerCase().match(/virtual|downloadable/) || (parent['Type'] || '').toLowerCase().match(/virtual|downloadable/);

            const row = {
              ...baseTemplate,
              'URL handle': handle,
              ...(isFirstVariant ? getBaseDetails() : {})
            };

            for (let i = 1; i <= 3; i++) {
              const attrNameCol = `Attribute ${i} name`;
              const attrValCol = `Attribute ${i} value(s)`;
              const optName = variant[attrNameCol] || parent[attrNameCol] || '';
              const optVal = variant[attrValCol] || '';
              if (optName && optVal) {
                row[`Option${i} name`] = optName;
                row[`Option${i} value`] = optVal;
              }
            }

            if (!row['Option1 name'] || !row['Option1 value']) {
              row['Option1 name'] = 'Title';
              row['Option1 value'] = variant['Name'] || `Variant ${vIndex + 1}`;
            }

            Object.assign(row, {
              'SKU': variant['SKU'] || parentSku,
              'Weight value (grams)': calculateWeight(variant) || calculateWeight(parent),
              'Inventory tracker': (variant['Manage stock?'] === 'yes' || parent['Manage stock?'] === 'yes') ? 'shopify' : '',
              'Inventory quantity': variant['Stock'] || parent['Stock'] || '',
              'Continue selling when out of stock': variant['Backorders allowed?'] === 'yes' ? 'continue' : 'deny',
              'Fulfillment service': 'manual',
              'Price': price,
              'Compare-at price': compareAtPrice,
              'Requires shipping': isVirtual ? 'FALSE' : 'TRUE',
              'Charge tax': (variant['Tax status'] === 'taxable' || parent['Tax status'] === 'taxable') ? 'TRUE' : 'FALSE',
            });

            const variantImage = variant['Images'] ? variant['Images'].split(',')[0].trim() : '';
            if (variantImage && !trackedImages.has(variantImage)) {
              row['Product image URL'] = variantImage;
              row['Variant image URL'] = variantImage;
              row['Image position'] = String(imagePosCounter++);
              trackedImages.add(variantImage);
            } else if (variantImage && trackedImages.has(variantImage)) {
              row['Variant image URL'] = variantImage;
            } else if (isFirstVariant && parentImages.length > 0 && !trackedImages.has(parentImages[0])) {
              row['Product image URL'] = parentImages[0];
              row['Variant image URL'] = parentImages[0];
              row['Image position'] = String(imagePosCounter++);
              trackedImages.add(parentImages[0]);
            }

            shopifyFormat.push(row);
            isFirstVariant = false;
          });

          parentImages.forEach(img => {
            if (!trackedImages.has(img)) {
              shopifyFormat.push({ ...baseTemplate, 'URL handle': handle, 'Product image URL': img, 'Image position': String(imagePosCounter++) });
              trackedImages.add(img);
            }
          });
        }
      });

      setShopifyCsvData(shopifyFormat);
      setRedirectsCsvData(redirectsFormat);
      setIsProcessing(false);
      setCurrentStep(3);
      setValidationReport(null);
    }, 800);
  };

  const triggerDownload = (data, headers, filename) => {
    const csvStr = unparseCSV(data, headers);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadSchemaCSV = () => {
    const headers = ['WooCommerce Source Column', 'Shopify Human Name', 'Shopify Namespace', 'Shopify Key', 'Suggested Type', 'Shopify CSV Header'];
    const data = [];

    aiMapping.metafields.forEach(m => {
      const parts = m.shopifyMeta.split('.');
      data.push({
        'WooCommerce Source Column': m.wooCol,
        'Shopify Human Name': m.name || m.wooCol,
        'Shopify Namespace': parts[2] || 'custom',
        'Shopify Key': parts[3] || 'unknown',
        'Suggested Type': m.type || 'single_line_text_field',
        'Shopify CSV Header': m.shopifyMeta
      });
    });

    if (aiMapping.descriptionStrategy === 'extract-metafields' && aiMapping.extractedSections) {
      aiMapping.extractedSections.forEach(sec => {
        const parts = sec.shopifyMeta.split('.');
        data.push({
          'WooCommerce Source Column': `Extracted from Description: ${sec.heading}`,
          'Shopify Human Name': sec.heading.replace(/[:\-]/g, '').trim(),
          'Shopify Namespace': parts[2] || 'custom',
          'Shopify Key': parts[3] || 'unknown',
          'Suggested Type': 'multi_line_text_field',
          'Shopify CSV Header': sec.shopifyMeta
        });
      });
    }

    triggerDownload(data, headers, 'shopify_metafield_schema_checklist.csv');
  };

  const handleAddExtractedSection = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      e.preventDefault();
      const val = e.target.value.trim();
      const cleanKey = val.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '');
      setAiMapping(prev => ({
        ...prev,
        extractedSections: [...(prev.extractedSections || []), { heading: val, shopifyMeta: `product.metafields.custom.${cleanKey}` }]
      }));
      e.target.value = '';
    }
  };

  const removeExtractedSection = (idx) => {
    setAiMapping(prev => ({
      ...prev,
      extractedSections: prev.extractedSections.filter((_, i) => i !== idx)
    }));
  };

  const handleAddHeading = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      e.preventDefault();
      setAiMapping(prev => ({
        ...prev,
        descriptionHeadings: [...(prev.descriptionHeadings || []), e.target.value.trim()]
      }));
      e.target.value = '';
    }
  };

  const removeHeading = (idx) => {
    setAiMapping(prev => ({
      ...prev,
      descriptionHeadings: prev.descriptionHeadings.filter((_, i) => i !== idx)
    }));
  };

  const handleReviewsUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setReviewsFileName(file.name);
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsed = parseCSV(text);
      const headers = parsed[0].map(h => h.trim());
      const rows = parsed.slice(1).filter(row => row.length > 1 || row[0] !== '').map(row => {
        const obj = {};
        headers.forEach((header, i) => { obj[header] = row[i]; });
        return obj;
      });
      setWooReviewsData(rows);
      processReviewsMapping(rows);
    };
    reader.readAsText(file);
  };

  const processReviewsMapping = (wooReviews) => {
    setTimeout(() => {
      const formattedReviews = [];
      wooReviews.forEach(review => {
        if (review['comment_approved'] !== '1') return;
        const productHandle = slugify(review['product_title'] || '');
        if (!productHandle) return;
        formattedReviews.push({
          'product_handle': productHandle,
          'rating': review['rating'] || '5',
          'title': review['title'] || 'Product Review',
          'author': review['comment_author'] || 'Verified Buyer',
          'email': review['comment_author_email'] || '',
          'body': review['comment_content'] || '',
          'created_at': review['comment_date'] || ''
        });
      });
      setShopifyReviewsData(formattedReviews);
      setIsProcessing(false);
    }, 500);
  };

  // --- Metafield Schema UI Handlers ---
  const generateCleanMetaName = (rawCol) => {
    const WOO_DICTIONARY = {
      'ID': 'WooCommerce Database ID (Junk)',
      'Is featured?': 'Featured Product Flag',
      'Visibility in catalog': 'Catalog Visibility',
      'Date sale price starts': 'Sale Start Date',
      'Date sale price ends': 'Sale End Date',
      'Tax class': 'WooCommerce Tax Class',
      'In stock?': 'In Stock Status Flag',
      'Low stock amount': 'Low Stock Threshold',
      'Sold individually?': 'Limit 1 Per Order Flag',
      'Length (cm)': 'Product Length',
      'Length (in)': 'Product Length',
      'Width (cm)': 'Product Width',
      'Width (in)': 'Product Width',
      'Height (cm)': 'Product Height',
      'Height (in)': 'Product Height',
      'Allow customer reviews?': 'Enable Reviews Flag',
      'Purchase note': 'Post-Purchase Customer Note',
      'Shipping class': 'WooCommerce Shipping Class',
      'Download limit': 'Digital Download Limit',
      'Download expiry days': 'Digital Download Expiry Days',
      'Grouped products': 'Grouped Product IDs',
      'Upsells': 'Upsell Product IDs',
      'Cross-sells': 'Cross-sell Product IDs',
      'External URL': 'Affiliate Link URL',
      'Button text': 'Affiliate Button Text',
      'Position': 'Menu Order / Sorting Position',
      // Explicit overrides for SEO and Subtitles
      'Short description': 'Short Description',
      'SEO title': 'SEO Title',
      'SEO description': 'SEO Description',
      'Meta: ps_subtitle': 'Product Subtitle'
    };

    if (WOO_DICTIONARY[rawCol]) return WOO_DICTIONARY[rawCol];

    let clean = rawCol.replace(/^(Meta|Attribute)[\s:]*/i, '').trim();

    const META_DICTIONARY = {
      '_edit_lock': 'WordPress Editor Lock (Junk)',
      '_edit_last': 'Last Edited By (Junk)',
      '_wp_old_date': 'Old Publish Date (Junk)',
      '_wc_average_rating': 'Average Review Rating',
      '_wc_review_count': 'Total Review Count',
      '_yoast_wpseo_title': 'Yoast SEO Title',
      '_yoast_wpseo_metadesc': 'Yoast SEO Description',
      '_yoast_wpseo_focuskw': 'Yoast Focus Keyword',
      '_thumbnail_id': 'Main Image ID (Junk)',
      '_product_version': 'WooCommerce Product Version (Junk)',
      '_price': 'Cached Price (Junk)',
      '_regular_price': 'Cached Regular Price (Junk)',
      '_sale_price': 'Cached Sale Price (Junk)',
      '_stock_status': 'Cached Stock Status',
      '_manage_stock': 'Manage Stock Flag',
      '_tax_status': 'Tax Status Flag',
      '_tax_class': 'Tax Class'
    };

    if (META_DICTIONARY[clean]) return META_DICTIONARY[clean];

    if (clean.match(/^Attribute \d+ visible/i)) return 'Attribute Visibility Flag (Junk)';
    if (clean.match(/^Attribute \d+ global/i)) return 'Attribute Global Flag (Junk)';
    if (clean.match(/^Attribute \d+ default/i)) return 'Attribute Default Value (Junk)';

    if (clean.startsWith('_yoast_wpseo_')) return 'Yoast SEO: ' + clean.replace('_yoast_wpseo_', '').replace(/_/g, ' ');
    if (clean.startsWith('_wc_')) return 'WooCommerce: ' + clean.replace('_wc_', '').replace(/_/g, ' ');
    if (clean.startsWith('_yith_')) return 'YITH Plugin: ' + clean.replace('_yith_', '').replace(/_/g, ' ');
    if (clean.startsWith('_wp_')) return 'WordPress System: ' + clean.replace('_wp_', '').replace(/_/g, ' ');

    clean = clean.replace(/value\(s\)/i, '').replace(/[_]/g, ' ').trim();
    if (!clean || clean.length <= 2) {
      clean = rawCol.replace(/[_]/g, ' ').trim();
    }

    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  };

  const rescueMetafield = (wooCol) => {
    let cleanName = generateCleanMetaName(wooCol).replace(' (Junk)', '').trim();
    setAiMapping(prev => ({
      ...prev,
      metafields: [...prev.metafields, {
        wooCol: wooCol,
        name: cleanName,
        shopifyMeta: `product.metafields.custom.${slugify(cleanName).replace(/-/g, '_')}`,
        type: 'single_line_text_field'
      }]
    }));
  };

  const removeMetafield = (wooCol) => {
    setAiMapping(prev => ({
      ...prev,
      metafields: prev.metafields.filter(m => m.wooCol !== wooCol)
    }));
  };

  const updateMetafield = (wooCol, field, value) => {
    setAiMapping(prev => ({
      ...prev,
      metafields: prev.metafields.map(m => m.wooCol === wooCol ? { ...m, [field]: value } : m)
    }));
  };

  const usedCoreCols = Object.values(aiMapping.coreMappings).filter(Boolean);
  const mappedMetaCols = aiMapping.metafields.map(m => m.wooCol);

  // FIX: We removed `usedCoreCols` from the exclusion logic. 
  // This allows columns like "Short description" to be mapped to BOTH the base CSV template AND as a Metafield!
  const allRejectedMetafields = wooColumns.filter(c => !KNOWN_WOO_BASE_COLS.includes(c) && !mappedMetaCols.includes(c));

  const filteredRejectedMetafields = allRejectedMetafields.filter(col => {
    if (!rejectedSearch) return true;
    const cleanName = generateCleanMetaName(col).toLowerCase();
    return col.toLowerCase().includes(rejectedSearch.toLowerCase()) || cleanName.includes(rejectedSearch.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-12">
      <header className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">AI Data Architect</h1>
            <p className="text-sm text-gray-500">Two-Tier Data Modeling & Migration Engine</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 flex gap-8 flex-col md:flex-row">

        <div className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sticky top-24">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 px-2">Migration Flow</h3>
            <ul className="space-y-2">
              {steps.map((step, index) => (
                <li key={step.id}>
                  <button
                    onClick={() => index <= currentStep && setCurrentStep(index)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${currentStep === index
                        ? 'bg-blue-50 text-blue-700'
                        : index < currentStep
                          ? 'text-green-600 hover:bg-gray-50'
                          : 'text-gray-400 cursor-not-allowed'
                      }`}
                    disabled={index > currentStep}
                  >
                    <span className={`flex-shrink-0 ${index < currentStep ? 'text-green-500' : ''}`}>
                      {step.icon}
                    </span>
                    {step.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex-1">

          {/* STEP 0: INTRO */}
          {currentStep === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-bold mb-4">Welcome to the Data Orchestrator</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                This intelligent tool parses complex WooCommerce exports and restructures them into a formal Shopify 2.0 Data Model. It builds Core Mappings, recovers hidden Metafields, and creates smart HTML accordions.
              </p>
              <button onClick={() => setCurrentStep(1)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors">
                Upload Data File <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 1: UPLOAD PRODUCTS */}
          {currentStep === 1 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-bold mb-4">Upload WooCommerce Data</h2>
              <p className="text-gray-600 mb-6">Select the raw Products CSV. The AI will audit a massive "Golden Sample" to build your data model.</p>

              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current.click()}
              >
                <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                <FileSpreadsheet className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">Click to Upload Products CSV</h3>
                <p className="text-gray-500 text-sm">Proceeds automatically to AI Modeling.</p>
              </div>
            </div>
          )}

          {/* STEP 2: AI ANALYSIS & DATA MODEL BLUEPRINT */}
          {currentStep === 2 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">

              {!aiReport && !isAnalyzing && (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Sparkles className="w-10 h-10" />
                  </div>
                  <h2 className="text-2xl font-bold mb-4">Ready for Data Modeling</h2>
                  <p className="text-gray-600 mb-8 max-w-lg mx-auto">
                    We've parsed <strong>{wooCsvData?.length} rows</strong>. The AI will now analyze a pre-computed Golden Sample to build a Two-Tier Data Model (Core Mappings + Metafields).
                  </p>

                  <div className="max-w-lg mx-auto text-left mb-8 bg-indigo-50 p-5 rounded-xl border border-indigo-100">
                    <label className="block text-sm font-bold text-indigo-900 mb-2">Live Product URL (Highly Recommended)</label>
                    <div className="flex items-center gap-3 bg-white border border-indigo-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
                      <Globe className="w-5 h-5 text-indigo-400" />
                      <input
                        type="text"
                        value={sampleProductUrl}
                        onChange={(e) => setSampleProductUrl(e.target.value)}
                        placeholder="https://your-woo-store.com/product/example"
                        className="flex-1 text-sm outline-none text-gray-700 bg-transparent"
                      />
                    </div>
                  </div>

                  <button onClick={analyzeDataWithAI} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 mx-auto shadow-lg transition-transform hover:scale-105">
                    Generate Blueprint <Wand2 className="w-5 h-5" />
                  </button>
                  <button onClick={() => setAiReport({ manual: true })} className="block mt-6 text-indigo-500 text-sm mx-auto hover:underline">
                    Skip AI and configure manually
                  </button>
                </div>
              )}

              {isAnalyzing && (
                <div className="text-center py-16">
                  <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Building Data Schema...</h3>
                  <p className="text-gray-500">Extracting Metafields, defining Core mappings, and analyzing description structures...</p>
                </div>
              )}

              {aiReport && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <LayoutTemplate className="w-8 h-8 text-indigo-600" />
                      <h2 className="text-2xl font-bold">Data Model Blueprint</h2>
                    </div>
                    {aiReport.manual !== true && (
                      <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> AI Generated
                      </span>
                    )}
                  </div>

                  {aiReport.manual !== true && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-8">
                      <h3 className="font-bold text-indigo-900 mb-2">Architect's Summary</h3>
                      <p className="text-indigo-800 text-sm mb-4 leading-relaxed">{aiReport.analysisSummary}</p>

                      <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-3">Strategic Rationale</h4>
                      <ul className="space-y-2">
                        {aiReport.strategicRationale?.map((rationale, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-indigo-800 bg-white bg-opacity-50 p-2 rounded-lg border border-indigo-100">
                            <Check className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                            <span>{rationale}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="space-y-6 mb-8">

                    {/* TIER 1: CORE MAPPINGS */}
                    <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-5 relative overflow-hidden shadow-sm">
                      {aiReport.manual !== true && <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg shadow-sm">AI Confirmed Mappings</div>}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Database className="w-5 h-5 text-indigo-600" />
                          <h3 className="text-lg font-bold text-gray-900">Tier 1: Core Template Mappings</h3>
                        </div>
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-bold">
                          <Check className="w-3 h-3 inline mr-1" /> Standard Fields Auto-Mapped
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-6">Standard Shopify fields like <strong>Price, SKU, Images, Variants, and Weight</strong> are handled automatically under the hood. Verify the primary data sources below:</p>

                      <div className="grid md:grid-cols-2 gap-5">
                        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                            Main Description
                            {aiMapping.coreMappings.descriptionCol && <CheckCircle className="w-3 h-3 text-indigo-500" />}
                          </label>
                          <select value={aiMapping.coreMappings.descriptionCol} onChange={(e) => setAiMapping({ ...aiMapping, coreMappings: { ...aiMapping.coreMappings, descriptionCol: e.target.value } })} className="w-full bg-transparent text-sm font-bold text-gray-900 focus:outline-none focus:ring-0 appearance-none cursor-pointer">
                            <option value="">-- Leave Blank --</option>
                            {wooColumns.map(col => (<option key={col} value={col}>{col}</option>))}
                          </select>
                        </div>

                        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                            Short Description
                            {aiMapping.coreMappings.shortDescriptionCol && <CheckCircle className="w-3 h-3 text-indigo-500" />}
                          </label>
                          <select value={aiMapping.coreMappings.shortDescriptionCol} onChange={(e) => setAiMapping({ ...aiMapping, coreMappings: { ...aiMapping.coreMappings, shortDescriptionCol: e.target.value } })} className="w-full bg-transparent text-sm font-bold text-gray-900 focus:outline-none focus:ring-0 appearance-none cursor-pointer">
                            <option value="">-- Leave Blank --</option>
                            {wooColumns.map(col => (<option key={col} value={col}>{col}</option>))}
                          </select>
                        </div>

                        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                            Categories
                            {aiMapping.coreMappings.categoriesCol && <CheckCircle className="w-3 h-3 text-indigo-500" />}
                          </label>
                          <select value={aiMapping.coreMappings.categoriesCol} onChange={(e) => setAiMapping({ ...aiMapping, coreMappings: { ...aiMapping.coreMappings, categoriesCol: e.target.value } })} className="w-full bg-transparent text-sm font-bold text-gray-900 focus:outline-none focus:ring-0 appearance-none cursor-pointer">
                            <option value="">-- Leave Blank --</option>
                            {wooColumns.map(col => (<option key={col} value={col}>{col}</option>))}
                          </select>
                        </div>

                        <div className="bg-white p-3 rounded-lg border border-indigo-300 shadow-sm ring-1 ring-indigo-100">
                          <label className="block text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                            Vendor/Brand Source
                            {aiMapping.coreMappings.vendorCol && <CheckCircle className="w-3 h-3 text-indigo-500" />}
                          </label>
                          <select value={aiMapping.coreMappings.vendorCol} onChange={(e) => setAiMapping({ ...aiMapping, coreMappings: { ...aiMapping.coreMappings, vendorCol: e.target.value } })} className="w-full bg-transparent text-sm font-bold text-indigo-900 focus:outline-none focus:ring-0 appearance-none cursor-pointer">
                            <option value="">-- Use Global Store Name Instead --</option>
                            {wooColumns.map(col => (<option key={col} value={col}>{col}</option>))}
                          </select>
                        </div>
                      </div>

                      {(!aiMapping.coreMappings.vendorCol) && (
                        <div className="mt-4 pt-4 border-t border-indigo-100 flex items-center gap-3">
                          <label className="text-sm font-bold text-gray-700 whitespace-nowrap">Global Fallback Vendor:</label>
                          <input type="text" value={storeVendor} onChange={(e) => setStoreVendor(e.target.value)} className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g., Default Store Name" />
                        </div>
                      )}
                    </div>

                    {/* TIER 2: DESCRIPTION EXTRACTIONS */}
                    <div className="border border-gray-200 rounded-xl p-5 relative overflow-hidden bg-white shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Tier 2A: Description Extractions</h3>

                      <div className="mb-4">
                        <select
                          value={aiMapping.descriptionStrategy}
                          onChange={(e) => setAiMapping({ ...aiMapping, descriptionStrategy: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-700"
                        >
                          <option value="extract-metafields">Extract Metafields: Splice internal headings into dedicated Shopify Metafields</option>
                          <option value="accordion">Accordion HTML: Keep in body, convert text to clean &lt;h3&gt; tabs</option>
                          <option value="merge">Merge HTML: Combine Short & Long with basic line breaks</option>
                          <option value="standard">Standard: Export Main Description as pure Plain Text</option>
                        </select>
                      </div>

                      {aiMapping.descriptionStrategy === 'extract-metafields' && (
                        <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                          <div className="flex items-start gap-3">
                            <Scissors className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
                            <div className="w-full">
                              <label className="block text-sm font-bold text-blue-900 mb-2">Sections to Extract</label>
                              <p className="text-xs text-blue-800 mb-3 leading-relaxed">The engine will slice the description at these exact headings and map the content into new Metafields. <br /><strong>Typical Shopify Blocks:</strong> FAQs, Ingredients, Shipping, Care Instructions.</p>

                              <div className="space-y-2 mb-4 w-full">
                                {aiMapping.extractedSections?.map((section, idx) => (
                                  <div key={idx} className="flex items-center gap-3 bg-white border border-blue-200 p-2 rounded shadow-sm w-full">
                                    <span className="text-sm font-bold text-gray-800 min-w-[120px]">{section.heading}</span>
                                    <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                    <span className="text-xs font-mono text-blue-600 flex-1 truncate" title={section.shopifyMeta}>{section.shopifyMeta}</span>
                                    <button onClick={() => removeExtractedSection(idx)} className="hover:bg-red-50 rounded p-1"><X className="w-4 h-4 text-red-500" /></button>
                                  </div>
                                ))}
                              </div>
                              <input
                                type="text"
                                onKeyDown={handleAddExtractedSection}
                                placeholder="Type heading to extract (e.g. 'FAQ:' or 'Shipping:') and press Enter"
                                className="w-full border border-blue-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* TIER 2: APPROVED METAFIELDS */}
                    <div className="border-2 border-blue-200 bg-white rounded-xl p-5 relative overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-blue-600" />
                          <h3 className="text-lg font-bold text-gray-900">Tier 2B: Approved Metafields</h3>
                        </div>
                        {(aiMapping.metafields.length > 0 || (aiMapping.extractedSections && aiMapping.extractedSections.length > 0)) && (
                          <button onClick={downloadSchemaCSV} className="text-sm bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2 font-bold transition-colors shadow-sm">
                            <Download className="w-4 h-4" /> Download Final Schema
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-4">These WooCommerce columns have been selected for export. Edit the <strong>Shopify Key</strong> to match existing metafields in your store.</p>

                      {aiMapping.metafields.length === 0 ? (
                        <div className="bg-gray-50 p-6 rounded text-sm text-gray-500 text-center border border-gray-200 border-dashed">No custom columns are currently approved for export.</div>
                      ) : (
                        <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-96 overflow-y-auto mb-6 shadow-sm">
                          <table className="w-full text-left text-sm border-collapse bg-white">
                            <thead className="sticky top-0 z-10 bg-gray-50 text-gray-700 shadow-sm border-b border-gray-200">
                              <tr>
                                <th className="p-3 font-bold w-1/4">WooCommerce Source</th>
                                <th className="p-3 font-bold min-w-[150px]">Shopify Name</th>
                                <th className="p-3 font-bold min-w-[250px]">Shopify Key (namespace.key)</th>
                                <th className="p-3 font-bold min-w-[150px]">Data Type</th>
                                <th className="p-3 font-bold text-center w-12"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {aiMapping.metafields.map((meta, idx) => (
                                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                  <td className="p-3 font-medium text-gray-900 truncate max-w-[150px]" title={meta.wooCol}>{meta.wooCol}</td>
                                  <td className="p-2">
                                    <input
                                      value={meta.name}
                                      onChange={(e) => updateMetafield(meta.wooCol, 'name', e.target.value)}
                                      className="w-full border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 border outline-none bg-white"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <input
                                      value={meta.shopifyMeta}
                                      onChange={(e) => updateMetafield(meta.wooCol, 'shopifyMeta', e.target.value)}
                                      className="w-full border-gray-300 rounded px-2 py-1.5 text-sm font-mono text-blue-700 focus:ring-1 focus:ring-blue-500 border outline-none bg-white"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <select
                                      value={meta.type}
                                      onChange={(e) => updateMetafield(meta.wooCol, 'type', e.target.value)}
                                      className="w-full border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 border outline-none bg-white"
                                    >
                                      <option value="single_line_text_field">Single line text</option>
                                      <option value="multi_line_text_field">Multi-line text</option>
                                      <option value="number_integer">Integer</option>
                                      <option value="number_decimal">Decimal</option>
                                      <option value="boolean">Boolean</option>
                                    </select>
                                  </td>
                                  <td className="p-2 text-center">
                                    <button onClick={() => removeMetafield(meta.wooCol)} className="text-gray-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors" title="Remove from export">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* TIER 2: REJECTED / UNMAPPED DATA (THE JUNK DRAWER) */}
                    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                      <button
                        onClick={() => setShowRejectedCols(!showRejectedCols)}
                        className="w-full flex items-center justify-between p-5 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-gray-200 p-1.5 rounded-md">
                            <AlertTriangle className="w-4 h-4 text-gray-600" />
                          </div>
                          <div className="text-left">
                            <h3 className="text-base font-bold text-gray-900">Tier 2C: Review Rejected Columns</h3>
                            <p className="text-xs text-gray-500 font-normal mt-0.5">{allRejectedMetafields.length} unused columns hidden from export.</p>
                          </div>
                        </div>
                        {showRejectedCols ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                      </button>

                      {showRejectedCols && (
                        <div className="p-5 animate-in slide-in-from-top-2">
                          <p className="text-sm text-gray-600 mb-4">The AI ignored these columns to prevent clutter. If you see valuable data, click <strong>Rescue</strong> to automatically generate a Shopify key and move it to the Approved list.</p>

                          <div className="mb-4 relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                            <input
                              type="text"
                              value={rejectedSearch}
                              onChange={(e) => setRejectedSearch(e.target.value)}
                              placeholder="Search rejected columns..."
                              className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>

                          {filteredRejectedMetafields.length === 0 ? (
                            <div className="text-center text-gray-400 text-sm py-4">
                              {allRejectedMetafields.length === 0 ? "No rejected columns left." : "No columns match your search."}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-2">
                              {filteredRejectedMetafields.map(col => {
                                const rawCleanName = generateCleanMetaName(col);
                                const isJunk = rawCleanName.includes('(Junk)');
                                const isCore = usedCoreCols.includes(col);
                                const displayName = rawCleanName.replace(' (Junk)', '').trim();

                                return (
                                  <div key={col} className={`flex items-start justify-between bg-white border border-gray-200 p-3 rounded-lg transition-colors shadow-sm ${isJunk ? 'opacity-60 bg-gray-50 hover:opacity-100' : 'hover:border-gray-300'}`}>
                                    <div className="flex flex-col min-w-0 flex-1 mr-3">
                                      <div className="flex items-start gap-2 mb-1 flex-wrap">
                                        <span className="text-sm font-bold text-gray-800 line-clamp-3 leading-tight" title={displayName}>{displayName}</span>
                                        {isJunk && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0 mt-0.5">System Data</span>}
                                        {isCore && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0 mt-0.5" title="Used in Core Mapping">Core Mapped</span>}
                                      </div>
                                      <span className="text-[10px] font-mono text-gray-400 truncate" title={col}>Raw: {col}</span>
                                    </div>
                                    <button
                                      onClick={() => rescueMetafield(col)}
                                      className={`flex items-center gap-1 text-xs font-bold px-3 py-2 rounded transition-colors flex-shrink-0 ${isJunk ? 'text-gray-500 bg-gray-200 hover:bg-gray-300' : 'text-blue-600 bg-blue-50 hover:bg-blue-100'}`}
                                    >
                                      <Plus className="w-3 h-3" /> Rescue
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Advanced Mappings Toggle */}
                    <div className="border border-gray-200 rounded-xl p-5">
                      <button
                        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                        className="w-full flex items-center justify-between font-bold text-gray-900 hover:text-indigo-600 transition-colors"
                      >
                        <span>Advanced Configuration Rules</span>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded-full font-medium text-gray-600">Review Mappings</span>
                      </button>

                      {showAdvancedSettings && (
                        <div className="mt-6 space-y-6 animate-in slide-in-from-top-2 duration-300">
                          <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                            <div>
                              <label className="block text-sm font-bold text-gray-700 mb-2">URL Handle Strategy</label>
                              <select value={aiMapping.handleStrategy} onChange={(e) => setAiMapping({ ...aiMapping, handleStrategy: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="sku">Generate from SKU (Prevents duplicates)</option>
                                <option value="title">Generate strictly from Product Title</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-bold text-gray-700 mb-2">Category Strategy</label>
                              <select value={aiMapping.categoryStrategy} onChange={(e) => setAiMapping({ ...aiMapping, categoryStrategy: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="safe-type">Safe Mode: Map to Product 'Type' & Tags (No Errors)</option>
                                <option value="smart-tags">Smart Tags Only (Extracts all paths into tags)</option>
                                <option value="strict-category">Strict: Map to 'Product category' (May cause Shopify taxonomy errors)</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>

                  <div className="flex justify-between items-center border-t border-gray-100 pt-6">
                    <button onClick={() => { setAiReport(null); setCurrentStep(1); }} className="text-gray-500 hover:text-gray-700 font-medium px-4 py-2">Back</button>
                    <button onClick={processMapping} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 shadow-md hover:shadow-lg">
                      {isProcessing ? 'Executing Blueprint...' : 'Execute Blueprint & Transform'} <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: VALIDATE & DOWNLOAD */}
          {currentStep === 3 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-center gap-3 mb-6">
                <ShieldCheck className="w-8 h-8 text-gray-800" />
                <h2 className="text-2xl font-bold">Data Transformation Engine</h2>
              </div>

              <div className={`border-2 rounded-xl p-6 mb-8 transition-colors duration-300 ${validationReport?.status === 'success' ? 'bg-green-50 border-green-200' :
                  validationReport?.status === 'error' ? 'bg-red-50 border-red-200' :
                    'bg-gray-50 border-gray-200'
                }`}>
                {!validationReport && !isValidating && (
                  <div className="text-center py-6">
                    <ShieldCheck className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <h3 className="font-bold text-gray-900 mb-2">Run Autonomous Pre-Flight Check</h3>
                    <p className="text-gray-600 text-sm mb-6 max-w-md mx-auto">The AI will verify that the new HTML Description logic and Metafields are cleanly mapped without generating unparsed characters or taxonomy errors.</p>
                    <button onClick={() => runPreFlightValidation()} className="bg-gray-900 hover:bg-black text-white px-6 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 mx-auto transition-transform hover:scale-105">
                      Run AI Pre-Flight Audit <Sparkles className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {isValidating && (
                  <div className="text-center py-8">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
                    <p className="text-blue-800 font-bold">Auditing final Shopify CSV structure against API rules...</p>
                  </div>
                )}

                {validationReport && !isValidating && (
                  <div className="animate-in fade-in duration-500 text-left">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        {validationReport.status === 'success' ? <CheckCircle className="w-8 h-8 text-green-600" /> : <AlertTriangle className="w-8 h-8 text-red-600" />}
                        <h3 className={`font-bold text-xl ${validationReport.status === 'success' ? 'text-green-900' : 'text-red-900'}`}>
                          {validationReport.status === 'success' ? 'Validation Passed: Ready for Import' : 'AI Detected Import Blockers'}
                        </h3>
                      </div>
                    </div>

                    <p className="text-sm font-medium text-gray-800 mb-4">{validationReport.summary}</p>
                    <ul className="space-y-2 mb-4">
                      {validationReport.details?.map((detail, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-700 bg-white bg-opacity-60 p-2.5 rounded border border-gray-200">
                          {validationReport.status === 'success' ? <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />}
                          <span className="leading-snug">{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {validationError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 mt-4 text-sm flex items-start gap-3 text-left">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p>{validationError}</p>
                  </div>
                )}
              </div>

              {/* Downloads */}
              <div className={`grid md:grid-cols-2 gap-4 mb-8 transition-opacity duration-300 ${(!validationReport || validationReport?.status === 'error') ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <div className="bg-white rounded-lg p-6 border border-gray-200 flex flex-col items-center text-center shadow-sm">
                  <ShoppingBag className="w-8 h-8 text-blue-600 mb-3" />
                  <h3 className="font-bold text-gray-900 mb-1">Shopify Products CSV</h3>
                  <p className="text-xs text-gray-500 mb-4">{shopifyCsvData?.length} rows</p>
                  <button onClick={() => triggerDownload(shopifyCsvData, dynamicShopifyHeaders, 'shopify_products_import.csv')} className="bg-blue-600 hover:bg-blue-700 text-white w-full px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors">
                    <Download className="w-4 h-4" /> Download Products
                  </button>
                </div>

                {generateRedirects && (
                  <div className="bg-white rounded-lg p-6 border border-gray-200 flex flex-col items-center text-center shadow-sm">
                    <LinkIcon className="w-8 h-8 text-green-600 mb-3" />
                    <h3 className="font-bold text-gray-900 mb-1">301 URL Redirects CSV</h3>
                    <p className="text-xs text-gray-500 mb-4">{redirectsCsvData?.length} paths</p>
                    <button onClick={() => triggerDownload(redirectsCsvData, REDIRECT_HEADERS, 'shopify_url_redirects.csv')} className="bg-green-600 hover:bg-green-700 text-white w-full px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors">
                      <Download className="w-4 h-4" /> Download Redirects
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center border-t border-gray-100 pt-6">
                <button onClick={() => setCurrentStep(2)} className="text-gray-500 hover:text-gray-700 font-medium px-4 py-2">Back to Blueprint</button>
                <button onClick={() => setCurrentStep(4)} className="text-blue-600 font-medium flex items-center gap-2 hover:text-blue-800">
                  Next: Historical Orders <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-center gap-3 mb-4">
                <ShoppingCart className="w-8 h-8 text-indigo-600" />
                <h2 className="text-2xl font-bold">Historical Orders Migration</h2>
              </div>
              <p className="text-gray-600 mb-6">Unlike simple products, Orders are relational data (linked to specific customers, products, and financial statuses). <strong>You cannot use a standard CSV import for historical orders in Shopify.</strong></p>
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-6 mb-6">
                <h4 className="font-bold text-indigo-900 mb-3">Industry Standard Solution: Matrixify</h4>
                <ol className="list-decimal list-inside text-indigo-900 space-y-3 text-sm">
                  <li>Install <strong>Matrixify</strong> from the Shopify App Store.</li>
                  <li>In WooCommerce, generate API credentials.</li>
                  <li>In Matrixify, select <strong>Import</strong> and provide your WooCommerce API keys.</li>
                  <li>Select to import <strong>Orders</strong>.</li>
                </ol>
              </div>
              <div className="flex justify-between items-center border-t border-gray-100 pt-6 mt-8">
                <button onClick={() => setCurrentStep(3)} className="text-gray-500 hover:text-gray-700 font-medium px-4 py-2">Back</button>
                <button onClick={() => setCurrentStep(5)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors">
                  Next: Product Reviews <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-center gap-3 mb-4">
                <MessageSquareQuote className="w-8 h-8 text-purple-600" />
                <h2 className="text-2xl font-bold">Product Reviews Migration</h2>
              </div>
              {!shopifyReviewsData ? (
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:bg-gray-50 cursor-pointer" onClick={() => reviewsInputRef.current.click()}>
                  <input type="file" accept=".csv" className="hidden" ref={reviewsInputRef} onChange={handleReviewsUpload} />
                  <MessageSquareQuote className="w-12 h-12 text-purple-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-1">Upload Reviews CSV</h3>
                </div>
              ) : (
                <div className="bg-purple-50 rounded-lg p-6 border border-purple-200 flex flex-col items-center text-center mb-6">
                  <CheckCircle className="w-12 h-12 text-purple-600 mb-3" />
                  <h3 className="font-bold text-purple-900 mb-1">Reviews Mapped Successfully</h3>
                  <button onClick={() => triggerDownload(shopifyReviewsData, REVIEW_HEADERS, 'shopify_product_reviews.csv')} className="mt-4 bg-purple-600 text-white px-8 py-3 rounded-lg flex items-center gap-2 w-full max-w-sm justify-center">
                    <Download className="w-4 h-4" /> Download Reviews
                  </button>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-gray-100 pt-6 mt-8">
                <button onClick={() => setCurrentStep(4)} className="text-gray-500 hover:text-gray-700 font-medium px-4 py-2">Back</button>
                <button onClick={() => setCurrentStep(6)} className="bg-blue-600 text-white px-6 py-3 rounded-lg flex items-center gap-2">Next: Customers <ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {currentStep === 6 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-bold mb-4">Migrating Customers & Passwords</h2>
              <p className="text-gray-600 mb-8">Export Customers from WooCommerce using the built-in exporter, then import them into Shopify using the Customers import tool.</p>
              <div className="flex justify-between items-center border-t border-gray-100 pt-6">
                <button onClick={() => setCurrentStep(5)} className="text-gray-500 hover:text-gray-700 font-medium px-4 py-2">Back</button>
                <button onClick={() => setCurrentStep(7)} className="bg-blue-600 text-white px-6 py-3 rounded-lg flex items-center gap-2">Final Step: SEO & Launch <ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {currentStep === 7 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-bold mb-4">SEO Preservation & Launch</h2>
              <ul className="list-disc list-inside text-gray-600 space-y-2 text-sm mb-8">
                <li>Upload URL Redirects CSV.</li>
                <li>Connect Domain and Submit Sitemap.</li>
              </ul>
              <div className="flex justify-start border-t border-gray-100 pt-6 mt-8">
                <button onClick={() => setCurrentStep(6)} className="text-gray-500 hover:text-gray-700 font-medium px-4 py-2">Back</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}