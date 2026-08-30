'use strict';

const fs = require('fs');
const path = require('path');
const defaultScope = require('./manager-inventory-audit-scope');

const NUMERIC_BSON_TYPES = new Set(['int', 'long', 'double', 'decimal', 'number']);
const RISK_ORDER = { standard: 1, medium: 2, high: 3 };
const SEVERITY_ORDER = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--') && !options.schemaReport) {
      options.schemaReport = argument;
      continue;
    }
    const key = {
      '--schema-report': 'schemaReport',
      '--markdown': 'markdown',
      '--json': 'json',
    }[argument];
    if (!key) throw new Error(`Unknown argument: ${argument}`);
    if (!argv[index + 1]) throw new Error(`Missing value for ${argument}`);
    options[key] = argv[index + 1];
    index += 1;
  }
  return options;
}

function normalizeTypeName(value) {
  const normalized = String(value || '').trim();
  const aliases = {
    ObjectID: 'objectId',
    ObjectId: 'objectId',
    objectid: 'objectId',
    Date: 'date',
    String: 'string',
    Boolean: 'boolean',
    Array: 'array',
    Object: 'object',
    Null: 'null',
  };
  return aliases[normalized] || normalized;
}

function mongooseType(schemaType) {
  if (!schemaType) return { expectedTypes: ['any'], elementTypes: [] };
  if (schemaType.$isMongooseDocumentArray || schemaType.instance === 'Array') {
    const elementType = schemaType.caster && !schemaType.schema
      ? mongooseType(schemaType.caster).expectedTypes
      : [];
    return { expectedTypes: ['array'], elementTypes: elementType };
  }
  if (schemaType.$isSingleNested || schemaType.schema) return { expectedTypes: ['object'], elementTypes: [] };
  const mapped = {
    String: 'string',
    Number: 'number',
    Date: 'date',
    Boolean: 'boolean',
    ObjectId: 'objectId',
    Decimal128: 'decimal',
    Buffer: 'binData',
    Map: 'object',
    Mixed: 'any',
  }[schemaType.instance] || String(schemaType.instance || 'any').toLowerCase();
  return { expectedTypes: [mapped], elementTypes: [] };
}

function mergeField(target, incoming) {
  const existing = target.get(incoming.field);
  if (!existing) {
    target.set(incoming.field, {
      ...incoming,
      expectedTypes: [...new Set(incoming.expectedTypes || [])],
      elementTypes: [...new Set(incoming.elementTypes || [])],
      models: [...new Set(incoming.models || [])],
      refs: [...new Set(incoming.refs || [])],
    });
    return;
  }
  existing.expectedTypes = [...new Set([...existing.expectedTypes, ...(incoming.expectedTypes || [])])];
  existing.elementTypes = [...new Set([...existing.elementTypes, ...(incoming.elementTypes || [])])];
  existing.models = [...new Set([...existing.models, ...(incoming.models || [])])];
  existing.refs = [...new Set([...existing.refs, ...(incoming.refs || [])])];
  existing.required = existing.required || incoming.required;
  existing.hasDefault = existing.hasDefault || incoming.hasDefault;
}

function addParentObjects(fields, field, modelName) {
  const normalized = field.replaceAll('[].', '.');
  const segments = normalized.split('.');
  if (segments.length < 2) return;
  const originalSegments = field.split('.');
  for (let index = 1; index < originalSegments.length; index += 1) {
    let parent = originalSegments.slice(0, index).join('.');
    if (parent.endsWith('[]')) parent = parent.slice(0, -2);
    const parentType = originalSegments[index - 1].endsWith('[]') ? 'array' : 'object';
    mergeField(fields, {
      field: parent,
      expectedTypes: [parentType],
      elementTypes: [],
      required: false,
      hasDefault: false,
      refs: [],
      models: [modelName],
    });
  }
}

function flattenSchema(schema, modelName, prefix = '', fields = new Map()) {
  for (const [pathName, schemaType] of Object.entries(schema.paths)) {
    const field = `${prefix}${pathName}`;
    const typeInfo = mongooseType(schemaType);
    const ref = schemaType.options?.ref || schemaType.caster?.options?.ref;
    mergeField(fields, {
      field,
      ...typeInfo,
      required: Boolean(schemaType.isRequired || schemaType.options?.required),
      hasDefault: schemaType.options?.default !== undefined,
      refs: ref ? [String(ref)] : [],
      models: [modelName],
    });
    addParentObjects(fields, field, modelName);

    if (schemaType.schema) {
      const isArray = schemaType.$isMongooseDocumentArray || schemaType.instance === 'Array';
      flattenSchema(schemaType.schema, modelName, `${field}${isArray ? '[]' : ''}.`, fields);
    }
  }
  return fields;
}

function normalizedIndex(index) {
  const key = Object.fromEntries(Object.entries(index.key || index[0] || {}).sort(([left], [right]) => left.localeCompare(right)));
  const options = index.options || index[1] || {};
  const source = index.key ? index : options;
  return {
    name: index.name || options.name || null,
    key,
    unique: Boolean(index.unique ?? options.unique),
    sparse: Boolean(index.sparse ?? options.sparse),
    expireAfterSeconds: index.expireAfterSeconds ?? options.expireAfterSeconds ?? null,
    partialFilterExpression: index.partialFilterExpression ?? options.partialFilterExpression ?? null,
    observableOptions: {
      unique: Object.hasOwn(source, 'unique'),
      sparse: Object.hasOwn(source, 'sparse'),
      expireAfterSeconds: Object.hasOwn(source, 'expireAfterSeconds'),
      partialFilterExpression: Object.hasOwn(source, 'partialFilterExpression'),
    },
  };
}

function indexSignature(index) {
  return JSON.stringify({ key: index.key, unique: index.unique, sparse: index.sparse, expireAfterSeconds: index.expireAfterSeconds, partialFilterExpression: index.partialFilterExpression });
}

function indexKeySignature(index) {
  return JSON.stringify(index.key);
}

function indexCompatible(expected, observed) {
  if (indexKeySignature(expected) !== indexKeySignature(observed)) return false;
  return ['unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression'].every((option) => (
    !observed.observableOptions?.[option]
    || JSON.stringify(expected[option]) === JSON.stringify(observed[option])
  ));
}

function loadModelCatalog(scope = defaultScope) {
  const referencedKeys = new Set(scope.endpoints.flatMap((item) => item.models));
  const modelCatalog = {};
  for (const key of referencedKeys) {
    const definition = scope.modelDefinitions[key];
    if (!definition) throw new Error(`Audit scope references an unknown model: ${key}`);
    const model = require(definition.module);
    modelCatalog[key] = {
      key,
      modelName: model.modelName,
      collection: model.collection.collectionName,
      risk: definition.risk || 'standard',
      fields: [...flattenSchema(model.schema, key).values()],
      indexes: model.schema.indexes().map(normalizedIndex),
    };
  }
  return modelCatalog;
}

function mergeModelCatalog(modelCatalog) {
  const collections = new Map();
  for (const model of Object.values(modelCatalog)) {
    const existing = collections.get(model.collection) || {
      name: model.collection,
      risk: 'standard',
      models: [],
      fields: new Map(),
      indexes: new Map(),
    };
    existing.models.push({ key: model.key, modelName: model.modelName });
    if (RISK_ORDER[model.risk] > RISK_ORDER[existing.risk]) existing.risk = model.risk;
    for (const field of model.fields) mergeField(existing.fields, field);
    for (const index of model.indexes) existing.indexes.set(indexSignature(index), index);
    collections.set(model.collection, existing);
  }
  return collections;
}

function reportCollectionMap(report) {
  return new Map((report.collections || []).map((collection) => [collection.name, {
    name: collection.name,
    totalDocuments: Number(collection.totalDocuments || 0),
    documentsScanned: Number(collection.documentsScanned || 0),
    fields: new Map((collection.fields || []).map((field) => [field.field, {
      field: field.field,
      types: (field.types || []).map(normalizeTypeName),
      presentIn: Number(field.presentIn || 0),
      presentPct: Number(field.presentPct || 0),
      emptyArray: Boolean(field.emptyArray) || /^\[0 item\(s\)\]$/.test(String(field.sample || '')),
    }])),
    indexes: (collection.indexes || []).map(normalizedIndex),
  }]));
}

function typeCompatible(expectedTypes, observedTypes) {
  const observed = observedTypes.filter((type) => type !== 'null');
  if (!observed.length || expectedTypes.includes('any')) return true;
  return observed.every((type) => expectedTypes.some((expected) => (
    expected === type || (expected === 'number' && NUMERIC_BSON_TYPES.has(type))
  )));
}

function operationsForField(usage, field) {
  const operations = ['read', 'filter', 'sort', 'populate']
    .filter((operation) => (usage?.[operation] || []).includes(field));
  if ((usage?.insert || []).includes(field) || (usage?.write || []).includes(field)) operations.push('insert');
  if ((usage?.update || []).includes(field) || (usage?.write || []).includes(field)) operations.push('update');
  return operations;
}

function usedFieldSet(usage) {
  return new Set(['read', 'filter', 'sort', 'populate', 'insert', 'update', 'write']
    .flatMap((operation) => usage?.[operation] || []));
}

function missingClassification(collectionName, field, expected, observedCollection, usage, overrides) {
  const override = overrides[`${collectionName}.${field}`];
  if (override) return override;
  if (!observedCollection || observedCollection.totalDocuments === 0) return 'unobservable-empty-collection';
  const arrayMarker = field.lastIndexOf('[].');
  if (arrayMarker >= 0) {
    const parent = field.slice(0, arrayMarker);
    const observedParent = observedCollection.fields.get(parent);
    if (!observedParent) return 'unobserved-optional-parent';
    if (observedParent.emptyArray) return 'unobserved-empty-array';
  }
  const segments = field.split('.');
  for (let index = 1; index < segments.length; index += 1) {
    const parent = segments.slice(0, index).join('.').replaceAll('[]', '');
    if (!observedCollection.fields.has(parent)) return 'unobserved-optional-parent';
  }
  const usedInAtomicOperation = ['filter']
    .some((operation) => (usage?.[operation] || []).includes(field));
  if (expected.required && (!expected.hasDefault || usedInAtomicOperation)) return 'required-but-unobserved';
  if (expected.hasDefault && !usedInAtomicOperation) return 'unobserved-defaulted';
  if (usedFieldSet(usage).has(field)) {
    return usedInAtomicOperation ? 'used-by-feature-but-unobserved' : 'unobserved-state-dependent';
  }
  return 'unobserved-optional';
}

function compareCollection(expectedCollection, observedCollection, usage = {}, overrides = {}) {
  const comparison = {
    name: expectedCollection.name,
    risk: expectedCollection.risk,
    models: expectedCollection.models,
    presentInSnapshot: Boolean(observedCollection),
    totalDocuments: observedCollection?.totalDocuments ?? null,
    documentsScanned: observedCollection?.documentsScanned ?? null,
    fieldComparisons: [],
    references: [],
    missingIndexes: [],
    unverifiedIndexOptions: [],
    additionalIndexes: [],
    summary: {},
  };

  const expectedFields = expectedCollection.fields;
  const observedFields = observedCollection?.fields || new Map();
  const allFields = new Set([...expectedFields.keys(), ...observedFields.keys(), ...usedFieldSet(usage)]);
  for (const field of [...allFields].sort()) {
    const expected = expectedFields.get(field);
    const observed = observedFields.get(field);
    const operations = operationsForField(usage, field);
    let classification = 'compatible';
    if (!expected && operations.length) classification = 'used-field-not-in-model';
    else if (!expected) classification = 'snapshot-only';
    else if (!observed) classification = missingClassification(expectedCollection.name, field, expected, observedCollection, usage, overrides);
    else if (!typeCompatible(expected.expectedTypes, observed.types)) classification = 'type-mismatch';

    comparison.fieldComparisons.push({
      field,
      expectedTypes: expected?.expectedTypes || [],
      observedTypes: observed?.types || [],
      required: Boolean(expected?.required),
      hasDefault: Boolean(expected?.hasDefault),
      presentPct: observed?.presentPct ?? null,
      operations,
      models: expected?.models || [],
      classification,
    });

    for (const ref of expected?.refs || []) {
      comparison.references.push({ field, ref });
    }
  }

  const expectedIndexes = [...expectedCollection.indexes.values()];
  const observedIndexes = observedCollection?.indexes || [];
  comparison.missingIndexes = expectedIndexes.filter((expected) => (
    !observedIndexes.some((observed) => indexCompatible(expected, observed))
  ));
  comparison.additionalIndexes = observedIndexes.filter((observed) => (
    observed.name !== '_id_' && !expectedIndexes.some((expected) => indexCompatible(expected, observed))
  ));
  comparison.unverifiedIndexOptions = expectedIndexes.flatMap((expected) => {
    const observed = observedIndexes.find((candidate) => indexKeySignature(candidate) === indexKeySignature(expected));
    if (!observed) return [];
    const options = ['unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression']
      .filter((option) => expected[option] !== null && expected[option] !== false && !observed.observableOptions?.[option]);
    return options.length ? [{ key: expected.key, options }] : [];
  });

  const classifications = comparison.fieldComparisons.reduce((result, field) => {
    result[field.classification] = (result[field.classification] || 0) + 1;
    return result;
  }, {});
  comparison.summary = {
    expectedFields: expectedFields.size,
    observedFields: observedFields.size,
    usedFields: usedFieldSet(usage).size,
    ...classifications,
  };
  return comparison;
}

function extractDeclaredRoutes(source) {
  const routes = [];
  const expression = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = expression.exec(source)) !== null) {
    routes.push({ method: match[1].toUpperCase(), route: match[2] });
  }
  return routes;
}

function routeCoverage(scope = defaultScope, readFile = fs.readFileSync) {
  const details = [];
  for (const [role, relativeSource] of Object.entries(scope.routeSources)) {
    const sourcePath = path.resolve(__dirname, relativeSource);
    const declared = extractDeclaredRoutes(readFile(sourcePath, 'utf8'));
    const scoped = scope.endpoints.filter((endpointEntry) => endpointEntry.role === role)
      .map(({ method, route }) => ({ method, route }));
    const declaredKeys = new Set(declared.map((route) => `${route.method} ${route.route}`));
    const scopedKeys = new Set(scoped.map((route) => `${route.method} ${route.route}`));
    details.push({
      role,
      declaredCount: declared.length,
      scopedCount: scoped.length,
      missingFromScope: [...declaredKeys].filter((key) => !scopedKeys.has(key)),
      staleScopeEntries: [...scopedKeys].filter((key) => !declaredKeys.has(key)),
    });
  }
  return details;
}

function codeReferenceTime(scope = defaultScope, stat = fs.statSync) {
  if (scope.codeReferenceAt) return new Date(scope.codeReferenceAt);
  const relativeFiles = [
    ...Object.values(scope.routeSources || {}),
    ...Object.values(scope.modelDefinitions || {}).map((definition) => definition.module),
  ];
  const times = relativeFiles.flatMap((relativeFile) => {
    try {
      const resolved = require.resolve(path.resolve(__dirname, relativeFile));
      return [stat(resolved).mtimeMs];
    } catch {
      return [];
    }
  });
  return times.length ? new Date(Math.max(...times)) : null;
}

function bindingFindings(scope, reportMap, expectedCollections) {
  const findings = [];
  for (const candidate of scope.namingCandidates) {
    if (!candidate.inScope || !expectedCollections.has(candidate.left)) continue;
    const bound = reportMap.get(candidate.left);
    const alternate = reportMap.get(candidate.right);
    if (bound && alternate && bound.totalDocuments === 0 && alternate.totalDocuments > 0) {
      const alternateCompatibility = compareCollection(
        expectedCollections.get(candidate.left),
        alternate,
        scope.collectionUsage[candidate.left] || {},
        scope.classificationOverrides || {},
      );
      findings.push({
        severity: 'high',
        code: 'EMPTY_ALTERNATE_BINDING',
        collection: candidate.left,
        alternateCollection: candidate.right,
        message: `Runtime model binds to empty ${candidate.left} while ${candidate.right} contains ${alternate.totalDocuments} document(s).`,
        recommendation: `Validate compatibility and rebind the manager inspection model to ${candidate.right}; plan any legacy merge separately.`,
        alternateCompatibility: {
          candidateCollection: candidate.right,
          summary: alternateCompatibility.summary,
          fieldComparisons: alternateCompatibility.fieldComparisons,
          missingIndexes: alternateCompatibility.missingIndexes,
        },
      });
    }
  }
  return findings;
}

function fieldFindings(collections) {
  const findings = [];
  for (const collection of collections) {
    for (const field of collection.fieldComparisons) {
      const severity = {
        'used-field-not-in-model': 'high',
        'required-but-unobserved': 'high',
        'type-mismatch': 'high',
        'used-by-feature-but-unobserved': 'medium',
        'used-with-safe-fallback': 'info',
        'unobserved-defaulted': 'info',
        'unobserved-state-dependent': 'info',
        'unobserved-workflow-optional': 'info',
      }[field.classification];
      if (!severity) continue;
      findings.push({
        severity,
        code: field.classification.toUpperCase().replaceAll('-', '_'),
        collection: collection.name,
        field: field.field,
        message: `${collection.name}.${field.field}: ${field.classification}.`,
        recommendation: field.classification === 'used-with-safe-fallback'
          ? 'Retain and document the fallback until all historical records are backfilled.'
          : severity === 'info'
            ? 'No repair is required solely from this sample; validate with state-appropriate data when available.'
            : 'Confirm the intended contract, then align the model, stored data, and feature usage in a separately approved change.',
      });
    }
    for (const index of collection.missingIndexes) {
      findings.push({
        severity: 'medium',
        code: 'EXPECTED_INDEX_UNOBSERVED',
        collection: collection.name,
        index,
        message: `${collection.name} is missing an index declared by an in-scope model.`,
        recommendation: 'Confirm the live index state before creating or changing any index.',
      });
    }
  }
  return findings;
}

function buildAudit(report, scope = defaultScope, suppliedModelCatalog) {
  if (!report || !Array.isArray(report.collections)) throw new Error('Invalid schema report: collections must be an array');
  const modelCatalog = suppliedModelCatalog || loadModelCatalog(scope);
  const expectedCollections = mergeModelCatalog(modelCatalog);
  const observedCollections = reportCollectionMap(report);
  const collections = [...expectedCollections.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((expected) => compareCollection(
      expected,
      observedCollections.get(expected.name),
      scope.collectionUsage[expected.name] || {},
      scope.classificationOverrides || {},
    ));
  const modelNameToCollection = new Map(Object.values(modelCatalog).flatMap((model) => [
    [model.modelName, model.collection],
    [model.key, model.collection],
  ]));
  for (const collection of collections) {
    collection.references = collection.references.map((reference) => {
      const targetCollection = modelNameToCollection.get(reference.ref) || null;
      return {
        ...reference,
        targetCollection,
        targetPresentInSnapshot: targetCollection ? observedCollections.has(targetCollection) : null,
      };
    });
  }

  const usedButUnreported = collections
    .filter((collection) => !collection.presentInSnapshot)
    .map((collection) => ({
      collection: collection.name,
      models: collection.models,
      endpointCount: scope.endpoints.filter((endpointEntry) => endpointEntry.models.some((key) => (
        modelCatalog[key]?.collection === collection.name
      ))).length,
    }));
  const bindings = bindingFindings(scope, observedCollections, expectedCollections);
  const coverage = routeCoverage(scope);
  const frontendFields = scope.frontendFields.map((field) => ({
    ...field,
    observedInSnapshot: Boolean(observedCollections.get(field.collection)?.fields.has(field.field)),
    declaredInModel: Boolean(expectedCollections.get(field.collection)?.fields.has(field.field)),
  }));
  const outOfScopeNamingAnomalies = scope.namingCandidates.filter((candidate) => !candidate.inScope).map((candidate) => ({
    ...candidate,
    leftDocuments: observedCollections.get(candidate.left)?.totalDocuments ?? null,
    rightDocuments: observedCollections.get(candidate.right)?.totalDocuments ?? null,
  }));
  const findings = [...bindings, ...fieldFindings(collections)]
    .sort((left, right) => SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity]
      || String(left.collection).localeCompare(String(right.collection))
      || String(left.field || '').localeCompare(String(right.field || '')));

  const endpointMatrix = scope.endpoints.map((endpointEntry) => ({
    ...endpointEntry,
    collections: [...new Set(endpointEntry.models.map((key) => modelCatalog[key]?.collection).filter(Boolean))],
  }));
  const routeCoverageComplete = coverage.every((entry) => !entry.missingFromScope.length && !entry.staleScopeEntries.length);
  const snapshotTime = report.generatedAt ? new Date(report.generatedAt) : null;
  const sourceTime = codeReferenceTime(scope);
  const snapshotAgeDays = snapshotTime && sourceTime && Number.isFinite(snapshotTime.getTime())
    ? Math.max(0, Math.floor((sourceTime - snapshotTime) / 86400000))
    : null;

  return {
    metadata: {
      database: report.database || null,
      snapshotGeneratedAt: report.generatedAt || null,
      auditGeneratedAt: new Date().toISOString(),
      codeReferenceAt: sourceTime?.toISOString() || null,
      codeNewerThanSnapshot: Boolean(snapshotTime && sourceTime && sourceTime > snapshotTime),
      snapshotAgeDays,
      snapshotCollectionCount: report.collections.length,
      inScopeCollectionCount: collections.length,
      registeredEndpointCount: endpointMatrix.length,
      uiReachableEndpointCount: endpointMatrix.filter((endpointEntry) => endpointEntry.uiReachable).length,
      routeCoverageComplete,
      offline: true,
    },
    summary: {
      highFindings: findings.filter((finding) => finding.severity === 'high').length,
      mediumFindings: findings.filter((finding) => finding.severity === 'medium').length,
      lowFindings: findings.filter((finding) => finding.severity === 'low').length,
      informationalFindings: findings.filter((finding) => finding.severity === 'info').length,
      incorrectBindings: bindings.length,
      usedButUnreportedCollections: usedButUnreported.length,
    },
    routeCoverage: coverage,
    endpointMatrix,
    collections,
    incorrectBindings: bindings,
    usedButUnreported,
    frontendFields,
    excludedCollections: scope.excludedCollections,
    outOfScopeNamingAnomalies,
    findings,
    limitations: [
      'The snapshot is point-in-time evidence, not a database validator.',
      'Fields absent from small samples may be legitimate optional or workflow-stage attributes.',
      'Empty collections cannot provide observed field or type evidence.',
      'Mongoose Number is compatible with BSON int, long, double, and decimal representations.',
      'No samples or document values are included in this audit output.',
      ...(snapshotAgeDays > 0 ? [`The audited code is approximately ${snapshotAgeDays} day(s) newer than the snapshot.`] : []),
    ],
  };
}

function markdownCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function listOrNone(values, formatter = (value) => value) {
  return values.length ? values.map((value) => `- ${formatter(value)}`).join('\n') : '- None confirmed.';
}

function renderMarkdown(audit) {
  const lines = [
    '# Manager and Inventory-Manager Collection Audit',
    '',
    '## Executive summary',
    '',
    `- Snapshot database: \`${audit.metadata.database || 'unknown'}\``,
    `- Snapshot generated: ${audit.metadata.snapshotGeneratedAt || 'unknown'}`,
    `- Code reference: ${audit.metadata.codeReferenceAt || 'unknown'}${audit.metadata.codeNewerThanSnapshot ? ` (approximately ${audit.metadata.snapshotAgeDays} day(s) newer than the snapshot)` : ''}`,
    `- Snapshot collections: ${audit.metadata.snapshotCollectionCount}`,
    `- In-scope runtime collections: ${audit.metadata.inScopeCollectionCount}`,
    `- Registered endpoints covered: ${audit.metadata.registeredEndpointCount}`,
    `- UI-reachable endpoints: ${audit.metadata.uiReachableEndpointCount}`,
    `- Route manifest complete: ${audit.metadata.routeCoverageComplete ? 'yes' : 'no'}`,
    `- High findings: ${audit.summary.highFindings}; medium findings: ${audit.summary.mediumFindings}; informational findings: ${audit.summary.informationalFindings}`,
    '',
    'This report was generated offline. It contains schema metadata only and does not include document samples or personal data.',
    '',
    '## Feature, endpoint, and collection matrix',
    '',
    '| Role | UI | Method | Route | Feature | Handler | Collections |',
    '|---|---:|---|---|---|---|---|',
    ...audit.endpointMatrix.map((entry) => `| ${entry.role} | ${entry.uiReachable ? 'Yes' : 'No'} | ${entry.method} | \`${markdownCell(entry.route)}\` | ${markdownCell(entry.feature)} | \`${markdownCell(entry.handler)}\` | ${entry.collections.map((collection) => `\`${collection}\``).join(', ') || 'None'} |`),
    '',
    '## Incorrect or empty collection bindings',
    '',
    listOrNone(audit.incorrectBindings, (finding) => `**${finding.severity.toUpperCase()}** — \`${finding.collection}\` → candidate \`${finding.alternateCollection}\`: ${finding.message} Recommendation: ${finding.recommendation}`),
    '',
    '## Used but unreported collections',
    '',
    listOrNone(audit.usedButUnreported, (entry) => `\`${entry.collection}\` — ${entry.endpointCount} registered endpoint(s); models: ${entry.models.map((model) => model.key).join(', ')}`),
    '',
    'The `/inventory/asset-return-logs` route reads returned documents from `asset_loans`; it does not query the dormant `asset_return_logs` model.',
    '',
    '## Severity-ranked findings',
    '',
    listOrNone(audit.findings, (finding) => `**${finding.severity.toUpperCase()}** \`${finding.code}\` — ${finding.message} ${finding.recommendation}`),
    '',
    '## Per-collection field and type comparison',
    '',
  ];

  const bindingDetails = [];
  for (const finding of audit.incorrectBindings) {
    const compatibility = finding.alternateCompatibility;
    if (!compatibility) continue;
    bindingDetails.push(
      `### Candidate compatibility: \`${finding.collection}\` model against \`${compatibility.candidateCollection}\``,
      '',
      '| Field | Expected | Observed | Classification |',
      '|---|---|---|---|',
      ...compatibility.fieldComparisons.map((field) => `| \`${markdownCell(field.field)}\` | ${field.expectedTypes.join(', ') || '—'} | ${field.observedTypes.join(', ') || '—'} | ${field.classification} |`),
      '',
    );
  }
  const usedButUnreportedHeading = lines.indexOf('## Used but unreported collections');
  lines.splice(usedButUnreportedHeading, 0, ...bindingDetails);

  for (const collection of audit.collections) {
    lines.push(
      `### \`${collection.name}\` (${collection.risk} risk)`,
      '',
      `Models: ${collection.models.map((model) => `\`${model.key}\` (${model.modelName})`).join(', ')}. Snapshot documents: ${collection.totalDocuments ?? 'collection absent'}; scanned: ${collection.documentsScanned ?? 'n/a'}.`,
      '',
      '| Field | Expected | Observed | Used by | Present | Classification |',
      '|---|---|---|---|---:|---|',
      ...collection.fieldComparisons.map((field) => `| \`${markdownCell(field.field)}\` | ${field.expectedTypes.join(', ') || '—'} | ${field.observedTypes.join(', ') || '—'} | ${field.operations.join(', ') || '—'} | ${field.presentPct === null ? '—' : `${field.presentPct}%`} | ${field.classification} |`),
      '',
    );
    if (collection.references.length) {
      lines.push('References:', '', ...collection.references.map((reference) => `- \`${reference.field}\` → Mongoose model \`${reference.ref}\`${reference.targetCollection ? ` → collection \`${reference.targetCollection}\` (${reference.targetPresentInSnapshot ? 'present' : 'absent'} in snapshot)` : ' (target collection unresolved in this scope)'}`), '');
    }
    if (collection.missingIndexes.length) {
      lines.push('Expected indexes not observed:', '', ...collection.missingIndexes.map((index) => `- \`${JSON.stringify(index.key)}\`${index.unique ? ' unique' : ''}${index.sparse ? ' sparse' : ''}`), '');
    }
    if (collection.unverifiedIndexOptions.length) {
      lines.push('Index options unavailable in snapshot:', '', ...collection.unverifiedIndexOptions.map((index) => `- \`${JSON.stringify(index.key)}\`: ${index.options.join(', ')} unverified`), '');
    }
  }

  lines.push(
    '## Frontend contract field classification',
    '',
    '| Collection | Field | Classification | Snapshot | Model | Notes |',
    '|---|---|---|---:|---:|---|',
    ...audit.frontendFields.map((field) => `| \`${field.collection}\` | \`${field.field}\` | ${field.classification} | ${field.observedInSnapshot ? 'Yes' : 'No'} | ${field.declaredInModel ? 'Yes' : 'No'} | ${markdownCell(field.note)} |`),
    '',
    '## Excluded dormant or unrelated collections',
    '',
    ...audit.excludedCollections.map((entry) => `- \`${entry.collection}\`: ${entry.reason}`),
    '',
    '## Out-of-scope naming anomalies',
    '',
    '| Candidate A | Documents | Candidate B | Documents | Relationship |',
    '|---|---:|---|---:|---|',
    ...audit.outOfScopeNamingAnomalies.map((candidate) => `| \`${candidate.left}\` | ${candidate.leftDocuments ?? 'absent'} | \`${candidate.right}\` | ${candidate.rightDocuments ?? 'absent'} | ${candidate.relation} |`),
    '',
    'These are naming candidates, not automatic duplicates. Domain ownership and runtime usage must be confirmed before consolidation.',
    '',
    '## Limitations',
    '',
    ...audit.limitations.map((limitation) => `- ${limitation}`),
    '',
  );
  return lines.join('\n');
}

function run(options) {
  if (!options.schemaReport) {
    throw new Error('Usage: node scripts/audit-schema-snapshot.js --schema-report <schema-report.json> [--markdown <output.md>] [--json <output.json>]');
  }
  const workspaceRoot = path.resolve(__dirname, '..', '..');
  const inputPath = path.resolve(options.schemaReport);
  const markdownPath = path.resolve(options.markdown || path.join(workspaceRoot, 'manager-inventory-schema-audit.md'));
  const jsonPath = path.resolve(options.json || path.join(workspaceRoot, 'manager-inventory-schema-audit.json'));
  const report = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const audit = buildAudit(report);
  fs.writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, `${renderMarkdown(audit)}\n`, 'utf8');
  return { audit, inputPath, markdownPath, jsonPath };
}

if (require.main === module) {
  try {
    const result = run(parseArgs(process.argv.slice(2)));
    console.log('READ-ONLY manager/inventory schema snapshot audit');
    console.log(`Input: ${result.inputPath}`);
    console.log(`Markdown: ${result.markdownPath}`);
    console.log(`JSON: ${result.jsonPath}`);
    console.log(`High findings: ${result.audit.summary.highFindings}`);
    console.log(`Used but unreported collections: ${result.audit.summary.usedButUnreportedCollections}`);
    if (!result.audit.metadata.routeCoverageComplete) process.exitCode = 2;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildAudit,
  compareCollection,
  extractDeclaredRoutes,
  flattenSchema,
  loadModelCatalog,
  indexCompatible,
  parseArgs,
  renderMarkdown,
  routeCoverage,
  run,
  typeCompatible,
};
