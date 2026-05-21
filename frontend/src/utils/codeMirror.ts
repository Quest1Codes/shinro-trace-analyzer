import { clickhouse } from 'sql-formatter';
import { type SQLConfig, SQLDialect, sql, keywordCompletionSource, schemaCompletionSource } from '@codemirror/lang-sql';
import { autocompletion } from '@codemirror/autocomplete';

const { tokenizerOptions } = clickhouse;

const allKeywords = [
  ...tokenizerOptions.reservedKeywords,
  ...tokenizerOptions.reservedClauses,
  ...tokenizerOptions.reservedSelect,
  ...tokenizerOptions.reservedSetOperations,
  ...tokenizerOptions.reservedJoins,
  ...(tokenizerOptions.reservedKeywordPhrases ?? []),
];


const CLAUSE_KEYWORDS = new Set(['final', 'settings', 'prewhere', 'sample']);

export const clickhouseDialect = SQLDialect.define({
  keywords: [...allKeywords, ...CLAUSE_KEYWORDS].join(' ').toLowerCase(),
  types: tokenizerOptions.reservedDataTypes.join(' ').toLowerCase(),
  builtin: tokenizerOptions.reservedFunctionNames
    .filter((k) => !CLAUSE_KEYWORDS.has(k.toLowerCase()))
    .join(' ').toLowerCase(),
  backslashEscapes: true,
  doubleDollarQuotedStrings: true,
  operatorChars: '*+-%<>!=&|~^/?:',
  identifierQuotes: '`"',
});


export const clickhouseSql = (config?: SQLConfig) => {
  const sqlExt = sql({ ...config, dialect: clickhouseDialect });

  const completionOverride = autocompletion({
    override: [
      keywordCompletionSource(clickhouseDialect, true),
      ...(config?.schema ? [schemaCompletionSource({ ...config, dialect: clickhouseDialect })] : []),
    ],
  });

  return [sqlExt, completionOverride];
};