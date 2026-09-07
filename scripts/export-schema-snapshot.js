'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const DEFAULT_SCAN_LIMIT = 1000;

function parseArgs(argv) {
  const options = { limit: DEFAULT_SCAN_LIMIT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const key = { '--limit': 'limit', '--json': 'json', '--markdown': 'markdown' }[argument];
    if (!key) throw new Error(`Unknown argument: ${argument}`);
    if (!argv[index + 1]) throw new Error(`Missing value for ${argument}`);
    options[key] = key === 'limit' ? Number(argv[index + 1]) : argv[index + 1];
    index += 1;
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 10000) {
    throw new Error('--limit must be a whole number between 1 and 10000');
  }
  return options;
}

function bsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (Buffer.isBuffer(value)) return 'binData';
  const bson = {
    ObjectId: 'objectId', Decimal128: 'decimal', Long: 'long', Int32: 'int',
    Double: 'double', Binary: 'binData', Timestamp: 'timestamp', BSONRegExp: 'regex',
  }[value?._bsontype];
  if (bson) return bson;
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

function collectDocumentFields(document) {
  const fields = new Map();
  const record = (field, value, emptyArray = false) => {
    const entry = fields.get(field) || { types: new Set(), emptyArray: false };
    entry.types.add(bsonType(value));
    entry.emptyArray ||= emptyArray;
    fields.set(field, entry);
  };
  const visit = (value, prefix) => {
    if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value) || value._bsontype) return;
    for (const [key, child] of Object.entries(value)) {
      const field = prefix ? `${prefix}.${key}` : key;
      record(field, child, Array.isArray(child) && child.length === 0);
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && !item._bsontype && !(item instanceof Date) && !Buffer.isBuffer(item)) {
            visit(item, `${field}[]`);
          }
        }
      } else if (child && typeof child === 'object' && !child._bsontype && !(child instanceof Date) && !Buffer.isBuffer(child)) {
        visit(child, field);
      }
    }
  };
  visit(document, '');
  return fields;
}

function summarizeFields(documents) {
  const aggregate = new Map();
  for (const document of documents) {
    for (const [field, observed] of collectDocumentFields(document)) {
      const entry = aggregate.get(field) || { types: new Set(), presentIn: 0, emptyArray: false };
      observed.types.forEach((type) => entry.types.add(type));
      entry.presentIn += 1;
      entry.emptyArray ||= observed.emptyArray;
      aggregate.set(field, entry);
    }
  }
  return [...aggregate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([field, entry]) => ({
    field,
    types: [...entry.types].sort(),
    presentIn: entry.presentIn,
    presentPct: documents.length ? Number(((entry.presentIn / documents.length) * 100).toFixed(2)) : 0,
    ...(entry.emptyArray ? { emptyArray: true } : {}),
  }));
}

function sanitizeIndex(index) {
  return {
    name: index.name,
    key: index.key,
    unique: Boolean(index.unique),
    sparse: Boolean(index.sparse),
    ...(index.expireAfterSeconds !== undefined ? { expireAfterSeconds: index.expireAfterSeconds } : {}),
    ...(index.partialFilterExpression ? { partialFilterExpression: index.partialFilterExpression } : {}),
  };
}

async function buildSnapshot(db, { limit = DEFAULT_SCAN_LIMIT } = {}) {
  const collectionInfos = await db.listCollections({}, { nameOnly: true }).toArray();
  const collections = [];
  for (const { name } of collectionInfos.sort((left, right) => left.name.localeCompare(right.name))) {
    const collection = db.collection(name);
    const [totalDocuments, documents, indexes] = await Promise.all([
      collection.countDocuments(),
      collection.find({}, { limit }).toArray(),
      collection.listIndexes().toArray().catch((error) => (
        error.codeName === 'NamespaceNotFound' ? [] : Promise.reject(error)
      )),
    ]);
    collections.push({
      name,
      totalDocuments,
      documentsScanned: documents.length,
      fields: summarizeFields(documents),
      indexes: indexes.map(sanitizeIndex),
    });
  }
  return { database: db.databaseName, generatedAt: new Date().toISOString(), collections };
}

function renderMarkdown(snapshot) {
  const lines = [
    '# MongoDB Schema Report', '',
    `**Database:** \`${snapshot.database}\`  `,
    `**Generated:** ${snapshot.generatedAt}`, '',
    '> Schema metadata only. Document values and samples are intentionally excluded.', '',
  ];
  for (const collection of snapshot.collections) {
    lines.push(
      `## Collection: \`${collection.name}\``, '',
      `- Total documents: ${collection.totalDocuments}`,
      `- Documents scanned: ${collection.documentsScanned}`, '',
      '| Field | Type(s) | Present In |', '|---|---|---:|',
      ...collection.fields.map((field) => `| \`${field.field}\` | ${field.types.join(', ')} | ${field.presentPct}% |`),
      '', '**Indexes:**', '',
      ...(collection.indexes.length ? collection.indexes.map((index) => {
        const options = [index.unique ? 'unique' : '', index.sparse ? 'sparse' : '', index.partialFilterExpression ? 'partial' : ''].filter(Boolean);
        return `- \`${index.name}\` on \`${JSON.stringify(index.key)}\`${options.length ? ` (${options.join(', ')})` : ''}`;
      }) : ['- None']), '', '---', '',
    );
  }
  return lines.join('\n');
}

async function run(options = {}) {
  const workspaceRoot = path.resolve(__dirname, '..', '..');
  const jsonPath = path.resolve(options.json || path.join(workspaceRoot, 'schema-report-new.json'));
  const markdownPath = path.resolve(options.markdown || path.join(workspaceRoot, 'schema-report-new.md'));
  await connectDB();
  const snapshot = await buildSnapshot(mongoose.connection.db, options);
  fs.writeFileSync(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, `${renderMarkdown(snapshot)}\n`, 'utf8');
  return { snapshot, jsonPath, markdownPath };
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).then(({ snapshot, jsonPath, markdownPath }) => {
    console.log(`Schema snapshot updated: ${snapshot.collections.length} collection(s)`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`Markdown: ${markdownPath}`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  }).finally(async () => mongoose.disconnect());
}

module.exports = {
  bsonType, buildSnapshot, collectDocumentFields, parseArgs, renderMarkdown, run, summarizeFields,
};
