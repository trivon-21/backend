const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');

/**
 * Layer 1: Validate file magic bytes (binary signatures)
 */
function validateMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) {
    return { isValid: false, detectedType: null, error: 'File is empty or too small.' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A;

  // JPEG / JPG: FF D8 FF
  const isJpg =
    buffer.length >= 3 &&
    buffer[0] === 0xFF &&
    buffer[1] === 0xD8 &&
    buffer[2] === 0xFF;

  // PDF: %PDF- (0x25 0x50 0x44 0x46) within the first 1024 bytes
  const headerSlice = buffer.slice(0, Math.min(buffer.length, 1024)).toString('ascii');
  const isPdf = headerSlice.includes('%PDF-');

  if (isPng) return { isValid: true, detectedType: 'image/png' };
  if (isJpg) return { isValid: true, detectedType: 'image/jpeg' };
  if (isPdf) return { isValid: true, detectedType: 'application/pdf' };

  return {
    isValid: false,
    detectedType: null,
    error: 'File signature is invalid. The file is not a genuine PNG, JPEG, or PDF.'
  };
}

/**
 * Payment Slip Keywords for Layer 2 content verification
 */
const PAYMENT_KEYWORDS = [
  // Transaction terms
  'transaction', 'txn', 'receipt', 'reference', 'ref no', 'ref number',
  'transfer', 'transferred', 'deposit', 'deposited', 'payment', 'paid',
  'fund transfer', 'remittance', 'successful', 'success', 'completed', 'approved',
  
  // Banking terms
  'account', 'acc no', 'acc number', 'beneficiary', 'recipient', 'sender',
  'balance', 'credit', 'debit', 'branch', 'bank',
  
  // Financial terms
  'amount', 'total', 'lkr', 'rs.', 'rs ', 'usd', 'subtotal', 'fee',
  
  // Common Sri Lankan and Regional Banks & Entities
  'commercial bank', 'sampath', 'boc', 'bank of ceylon', 'hnb', 'hatton',
  'peoples bank', "people's bank", 'seylan', 'nsb', 'ndb', 'dfcc',
  'nations trust', 'cargills bank', 'airlux', 'trivon'
];

/**
 * Extract text from PDF buffer
 */
async function extractTextFromPdf(buffer) {
  try {
    if (typeof pdfParse === 'function') {
      const data = await pdfParse(buffer);
      return data.text || '';
    } else if (pdfParse && pdfParse.PDFParse) {
      const parser = new pdfParse.PDFParse({ data: buffer });
      const result = await parser.getText();
      return result.text || '';
    }
    return '';
  } catch (err) {
    console.error('[SlipValidation] PDF parse error:', err.message);
    throw new Error('Unable to read PDF content. Please ensure it is a valid document.');
  }
}

/**
 * Extract text from Image buffer using Tesseract OCR
 */
async function extractTextFromImage(buffer) {
  try {
    const result = await Tesseract.recognize(buffer, 'eng');
    return result.data?.text || '';
  } catch (err) {
    console.error('[SlipValidation] Image OCR error:', err.message);
    throw new Error('Unable to process image OCR.');
  }
}

/**
 * Layer 2: Inspect extracted text against payment slip vocabulary
 */
function analyzePaymentText(text) {
  if (!text || typeof text !== 'string') {
    return {
      isValid: false,
      matchedCount: 0,
      matchedKeywords: [],
      reason: 'No readable text could be found on the uploaded document.'
    };
  }

  const normalized = text.toLowerCase();
  const matched = [];

  for (const keyword of PAYMENT_KEYWORDS) {
    if (normalized.includes(keyword)) {
      matched.push(keyword);
    }
  }

  // Deduplicate and count
  const uniqueMatched = [...new Set(matched)];
  
  // High confidence keywords
  const hasTxnIndicator = uniqueMatched.some(k => 
    ['transaction', 'txn', 'reference', 'ref no', 'ref number', 'receipt', 'transfer', 'transferred', 'deposit', 'deposited', 'payment'].includes(k)
  );
  const hasFinancialIndicator = uniqueMatched.some(k => 
    ['amount', 'total', 'lkr', 'rs.', 'rs ', 'usd', 'paid'].includes(k)
  );
  const hasBankingIndicator = uniqueMatched.some(k => 
    ['account', 'acc no', 'acc number', 'bank', 'beneficiary', 'recipient', 'branch', 'commercial bank', 'sampath', 'boc', 'hnb', 'seylan', 'peoples bank'].includes(k)
  );

  // Criteria:
  // 1. At least 3 distinct payment keywords matched, OR
  // 2. Contains (Transaction indicator + Financial indicator) OR (Transaction indicator + Banking indicator)
  const isLikelySlip =
    uniqueMatched.length >= 3 ||
    (hasTxnIndicator && (hasFinancialIndicator || hasBankingIndicator));

  return {
    isValid: isLikelySlip,
    matchedCount: uniqueMatched.length,
    matchedKeywords: uniqueMatched,
    hasTxnIndicator,
    hasFinancialIndicator,
    hasBankingIndicator
  };
}

/**
 * Full Slip Validation Pipeline (Layer 1 + Layer 2)
 */
async function validatePaymentSlip(fileBuffer, declaredMimetype) {
  // 1. Layer 1: Magic Byte Check
  const magicCheck = validateMagicBytes(fileBuffer);
  if (!magicCheck.isValid) {
    return {
      isValid: false,
      layer: 'LAYER_1_MAGIC_BYTES',
      error: magicCheck.error || 'Invalid file format. Please upload a real PNG, JPEG, or PDF.'
    };
  }

  // 2. Layer 2: Text Extraction
  let extractedText = '';
  const detectedType = magicCheck.detectedType;

  try {
    if (detectedType === 'application/pdf') {
      extractedText = await extractTextFromPdf(fileBuffer);
    } else {
      extractedText = await extractTextFromImage(fileBuffer);
    }
  } catch (err) {
    return {
      isValid: false,
      layer: 'LAYER_2_EXTRACTION_ERROR',
      error: 'Unable to process document content. Please ensure the file is not password-protected or corrupted.'
    };
  }

  // 3. Layer 2: Keyword & Content Analysis
  const analysis = analyzePaymentText(extractedText);
  if (!analysis.isValid) {
    return {
      isValid: false,
      layer: 'LAYER_2_CONTENT_OCR',
      matchedKeywords: analysis.matchedKeywords,
      error: 'The uploaded document does not appear to be a valid bank payment slip or transaction receipt. Please ensure bank details, reference number, or amount are clearly visible.'
    };
  }

  return {
    isValid: true,
    detectedType,
    matchedCount: analysis.matchedCount,
    matchedKeywords: analysis.matchedKeywords
  };
}

module.exports = {
  validateMagicBytes,
  validatePaymentSlip,
  analyzePaymentText
};
