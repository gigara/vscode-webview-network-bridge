import { writeFile } from 'node:fs/promises';

const GITHUB_API_TREE_URL = 'https://api.github.com/repos/microsoft/vscode/git/trees/main?recursive=1';
const GITHUB_RAW_BASE_URL = 'https://raw.githubusercontent.com/microsoft/vscode/main/';

const DARK_PLUS_THEME_URL =
  'https://raw.githubusercontent.com/microsoft/vscode/main/extensions/theme-defaults/themes/dark_plus.json';
const DARK_BASE_THEME_URL =
  'https://raw.githubusercontent.com/microsoft/vscode/main/extensions/theme-defaults/themes/dark_vs.json';
const LIGHT_PLUS_THEME_URL =
  'https://raw.githubusercontent.com/microsoft/vscode/main/extensions/theme-defaults/themes/light_plus.json';
const LIGHT_BASE_THEME_URL =
  'https://raw.githubusercontent.com/microsoft/vscode/main/extensions/theme-defaults/themes/light_vs.json';
const OUTPUT_PATH = new URL('../src/vscodeCssVariables.ts', import.meta.url);

const EXTRA_WEBVIEW_VARS = {
  '--vscode-font-family': "-apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', sans-serif",
  '--vscode-font-weight': 'normal',
  '--vscode-font-size': '13px',
  '--vscode-editor-font-family': "-apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', sans-serif",
  '--vscode-editor-font-weight': 'normal',
  '--vscode-editor-font-size': '13px',
  '--vscode-editor-font-feature-settings': 'normal'
};

const COLOR_REGISTRY_ADDITIONAL_FILES = ['src/vs/workbench/common/theme.ts'];

const COLOR_EXPRESSION_ALIASES = {
  'Color.white': '#FFFFFF',
  'Color.black': '#000000',
  'Color.transparent': '#00000000'
};

function toCssVarName(themeColorId) {
  return `--vscode-${themeColorId.replace(/\./g, '-')}`;
}

function parseJsoncLike(content) {
  return Function(`"use strict"; return (${content});`)();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'vscode-webview-network-bridge-generator'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'vscode-webview-network-bridge-generator'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function fetchJsoncLike(url) {
  const content = await fetchText(url);
  return parseJsoncLike(content);
}

function skipWhitespace(text, index) {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function parseStringToken(text, startIndex) {
  const quote = text[startIndex];
  if (quote !== '"' && quote !== "'" && quote !== '`') {
    return undefined;
  }

  let cursor = startIndex + 1;
  let value = '';
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === '\\') {
      value += char;
      cursor += 1;
      if (cursor < text.length) {
        value += text[cursor];
        cursor += 1;
      }
      continue;
    }

    if (char === quote) {
      return { value, end: cursor + 1 };
    }

    value += char;
    cursor += 1;
  }

  return undefined;
}

function readExpression(text, startIndex, stopChars) {
  let cursor = startIndex;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  while (cursor < text.length) {
    const char = text[cursor];

    if (char === '"' || char === "'" || char === '`') {
      const token = parseStringToken(text, cursor);
      if (!token) {
        break;
      }
      cursor = token.end;
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
      cursor += 1;
      continue;
    }

    if (char === ')') {
      if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0 && stopChars.has(')')) {
        break;
      }

      parenDepth = Math.max(0, parenDepth - 1);
      cursor += 1;
      continue;
    }

    if (char === '{') {
      braceDepth += 1;
      cursor += 1;
      continue;
    }

    if (char === '}') {
      if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0 && stopChars.has('}')) {
        break;
      }

      braceDepth = Math.max(0, braceDepth - 1);
      cursor += 1;
      continue;
    }

    if (char === '[') {
      bracketDepth += 1;
      cursor += 1;
      continue;
    }

    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      cursor += 1;
      continue;
    }

    if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0 && stopChars.has(char)) {
      break;
    }

    cursor += 1;
  }

  return {
    value: text.slice(startIndex, cursor).trim(),
    end: cursor
  };
}

function parseObjectLiteralProperties(objectLiteral) {
  const body = objectLiteral.trim().replace(/^\{/, '').replace(/\}$/, '');
  const properties = {};
  let cursor = 0;

  while (cursor < body.length) {
    cursor = skipWhitespace(body, cursor);
    if (body[cursor] === ',') {
      cursor += 1;
      continue;
    }

    if (cursor >= body.length) {
      break;
    }

    let key;
    if (body[cursor] === '"' || body[cursor] === "'" || body[cursor] === '`') {
      const keyToken = parseStringToken(body, cursor);
      if (!keyToken) {
        break;
      }
      key = keyToken.value;
      cursor = keyToken.end;
    } else {
      const keyMatch = /^[A-Za-z_$][\w$]*/.exec(body.slice(cursor));
      if (!keyMatch) {
        cursor += 1;
        continue;
      }
      key = keyMatch[0];
      cursor += key.length;
    }

    cursor = skipWhitespace(body, cursor);
    if (body[cursor] !== ':') {
      continue;
    }

    cursor += 1;
    cursor = skipWhitespace(body, cursor);

    const valueToken = readExpression(body, cursor, new Set([',']));
    properties[key] = valueToken.value;

    cursor = valueToken.end;
    if (body[cursor] === ',') {
      cursor += 1;
    }
  }

  return properties;
}

function normalizeHex(hex) {
  const value = hex.trim().replace(/^['"]|['"]$/g, '').replace(/^#/, '');
  if (![3, 4, 6, 8].includes(value.length)) {
    return undefined;
  }

  const expanded =
    value.length === 3 || value.length === 4
      ? value
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : value;

  return `#${expanded.toUpperCase()}`;
}

function applyTransparency(hex, ratio) {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return undefined;
  }

  const base = normalized.slice(1);
  const red = Number.parseInt(base.slice(0, 2), 16);
  const green = Number.parseInt(base.slice(2, 4), 16);
  const blue = Number.parseInt(base.slice(4, 6), 16);
  const alphaBase = base.length === 8 ? Number.parseInt(base.slice(6, 8), 16) / 255 : 1;

  const alpha = Math.max(0, Math.min(1, alphaBase * ratio));
  const alphaInt = Math.round(alpha * 255);

  const alphaHex = alphaInt.toString(16).padStart(2, '0').toUpperCase();
  return `#${red.toString(16).padStart(2, '0').toUpperCase()}${green
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()}${blue.toString(16).padStart(2, '0').toUpperCase()}${alphaHex}`;
}

function parseColorExpression(expression) {
  const expr = expression.trim();
  if (!expr || expr === 'null') {
    return undefined;
  }

  if (COLOR_EXPRESSION_ALIASES[expr]) {
    return COLOR_EXPRESSION_ALIASES[expr];
  }

  const directHex = normalizeHex(expr);
  if (directHex) {
    return directHex;
  }

  const rgbaMatch = /^new\s+Color\(\s*new\s+RGBA\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)\s*\)$/.exec(
    expr
  );
  if (rgbaMatch) {
    const red = Number.parseInt(rgbaMatch[1], 10);
    const green = Number.parseInt(rgbaMatch[2], 10);
    const blue = Number.parseInt(rgbaMatch[3], 10);
    const alphaValue = Number.parseFloat(rgbaMatch[4]);
    const alpha = alphaValue > 1 ? Math.max(0, Math.min(255, Math.round(alphaValue))) / 255 : Math.max(0, Math.min(1, alphaValue));
    const alphaHex = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
    return `#${red.toString(16).padStart(2, '0').toUpperCase()}${green
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()}${blue.toString(16).padStart(2, '0').toUpperCase()}${alphaHex}`;
  }

  const fromHexTransparentMatch = /^Color\.fromHex\((['"]#[0-9a-fA-F]{3,8}['"])\)\.transparent\((\d*\.?\d+)\)$/.exec(
    expr
  );
  if (fromHexTransparentMatch) {
    const baseHex = normalizeHex(fromHexTransparentMatch[1]);
    if (!baseHex) {
      return undefined;
    }
    const ratio = Number.parseFloat(fromHexTransparentMatch[2]);
    return applyTransparency(baseHex, ratio);
  }

  const fromHexMatch = /^Color\.fromHex\((['"]#[0-9a-fA-F]{3,8}['"])\)$/.exec(expr);
  if (fromHexMatch) {
    return normalizeHex(fromHexMatch[1]);
  }

  const transparentMatch = /^transparent\((.+),\s*(\d*\.?\d+)\)$/.exec(expr);
  if (transparentMatch) {
    const baseColor = parseColorExpression(transparentMatch[1]);
    if (!baseColor) {
      return undefined;
    }
    const ratio = Number.parseFloat(transparentMatch[2]);
    return applyTransparency(baseColor, ratio);
  }

  return undefined;
}

function parseColorDefaultsExpression(expression) {
  const expr = expression.trim();
  const singleColor = parseColorExpression(expr);
  if (singleColor) {
    return { dark: singleColor, light: singleColor };
  }

  if (!expr.startsWith('{')) {
    return { dark: undefined, light: undefined };
  }

  const properties = parseObjectLiteralProperties(expr);
  return {
    dark: parseColorExpression(properties.dark ?? ''),
    light: parseColorExpression(properties.light ?? '')
  };
}

function parseRegisterColorDefaults(source) {
  const defaultsById = {};
  let cursor = 0;

  while (cursor < source.length) {
    const callIndex = source.indexOf('registerColor(', cursor);
    if (callIndex === -1) {
      break;
    }

    let argumentCursor = skipWhitespace(source, callIndex + 'registerColor('.length);
    const idToken = parseStringToken(source, argumentCursor);
    if (!idToken) {
      cursor = callIndex + 1;
      continue;
    }

    argumentCursor = skipWhitespace(source, idToken.end);
    if (source[argumentCursor] !== ',') {
      cursor = callIndex + 1;
      continue;
    }

    argumentCursor = skipWhitespace(source, argumentCursor + 1);
    const defaultsToken = readExpression(source, argumentCursor, new Set([',', ')']));
    const defaults = parseColorDefaultsExpression(defaultsToken.value);

    if (defaults.dark || defaults.light) {
      defaultsById[idToken.value] = defaults;
    }

    cursor = defaultsToken.end + 1;
  }

  return defaultsById;
}

async function getColorRegistrySourcePaths() {
  const treeResponse = await fetchJson(GITHUB_API_TREE_URL);
  const paths = treeResponse.tree
    .filter((entry) => entry.type === 'blob')
    .map((entry) => entry.path)
    .filter((path) => path.startsWith('src/vs/platform/theme/common/colors/') && path.endsWith('.ts'));

  for (const additionalPath of COLOR_REGISTRY_ADDITIONAL_FILES) {
    if (!paths.includes(additionalPath)) {
      paths.push(additionalPath);
    }
  }

  return paths.sort((a, b) => a.localeCompare(b));
}

async function collectRegistryDefaults() {
  const sourcePaths = await getColorRegistrySourcePaths();
  const files = await Promise.all(
    sourcePaths.map(async (path) => {
      const content = await fetchText(`${GITHUB_RAW_BASE_URL}${path}`);
      return { path, content };
    })
  );

  const defaultsById = {};
  for (const file of files) {
    const parsed = parseRegisterColorDefaults(file.content);
    Object.assign(defaultsById, parsed);
  }

  return {
    defaultsById,
    sourcePaths
  };
}

function getThemeColors(theme) {
  if (!theme || typeof theme !== 'object' || !theme.colors || typeof theme.colors !== 'object') {
    return {};
  }

  return theme.colors;
}

function buildThemeCssVariableMap(themeColors, defaultsById, themeKind) {
  const variables = {};

  for (const [themeColorId, defaults] of Object.entries(defaultsById)) {
    const value = themeKind === 'light' ? defaults.light : defaults.dark;
    if (typeof value === 'string') {
      variables[toCssVarName(themeColorId)] = value;
    }
  }

  for (const [themeColorId, value] of Object.entries(themeColors)) {
    if (typeof value !== 'string') {
      continue;
    }

    const cssVarName = toCssVarName(themeColorId);
    variables[cssVarName] = value;
  }

  for (const [name, value] of Object.entries(EXTRA_WEBVIEW_VARS)) {
    variables[name] = value;
  }

  return Object.fromEntries(Object.entries(variables).sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const [darkBaseTheme, darkPlusTheme, lightBaseTheme, lightPlusTheme, registryDefaults] = await Promise.all([
    fetchJsoncLike(DARK_BASE_THEME_URL),
    fetchJsoncLike(DARK_PLUS_THEME_URL),
    fetchJsoncLike(LIGHT_BASE_THEME_URL),
    fetchJsoncLike(LIGHT_PLUS_THEME_URL),
    collectRegistryDefaults()
  ]);

  const darkThemeColors = {
    ...getThemeColors(darkBaseTheme),
    ...getThemeColors(darkPlusTheme)
  };

  const lightThemeColors = {
    ...getThemeColors(lightBaseTheme),
    ...getThemeColors(lightPlusTheme)
  };

  const darkPlusCssVariables = buildThemeCssVariableMap(darkThemeColors, registryDefaults.defaultsById, 'dark');
  const lightPlusCssVariables = buildThemeCssVariableMap(lightThemeColors, registryDefaults.defaultsById, 'light');

  const content = `/*\n * SPDX-License-Identifier: MIT\n * Copyright (c) 2026 Gigara Hettige\n */\n\n// Generated by scripts/generate-vscode-css-vars.mjs\n// Sources:\n// - ${DARK_BASE_THEME_URL}\n// - ${DARK_PLUS_THEME_URL}\n// - ${LIGHT_BASE_THEME_URL}\n// - ${LIGHT_PLUS_THEME_URL}\n// - ${GITHUB_API_TREE_URL}\n// - ${registryDefaults.sourcePaths.length} VS Code color registry source files\n\nexport type VSCodeCssVariableName = \`--vscode-\${string}\`;\n\nexport type VSCodeCssVariables = Partial<Record<VSCodeCssVariableName, string>>;\n\nexport const VSCODE_DARK_PLUS_CSS_VARIABLES: VSCodeCssVariables = ${JSON.stringify(darkPlusCssVariables, null, 2)};\n\nexport const VSCODE_LIGHT_PLUS_CSS_VARIABLES: VSCodeCssVariables = ${JSON.stringify(lightPlusCssVariables, null, 2)};\n`;

  await writeFile(OUTPUT_PATH, content, 'utf8');
  console.log(
    `Generated ${Object.keys(darkPlusCssVariables).length} Dark+ values and ${Object.keys(lightPlusCssVariables).length} Light+ values using ${Object.keys(registryDefaults.defaultsById).length} scraped registry defaults at ${OUTPUT_PATH.pathname}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
