#!/usr/bin/env node

/**
 * Import tools from tools.yaml to SQLite database
 *
 * This script reads the tools.yaml file and imports the tools into the SQLite database.
 * It handles creating slugs, importing categories, and setting up support relationships.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const sqlite3 = require('sqlite3').verbose();
const {open} = require('sqlite');
const crypto = require('crypto');

// Paths
const TOOLS_YAML_PATH = path.join(__dirname, '..', 'src', '_data', 'tools.yaml');
const DB_PATH = path.join(__dirname, 'tools.db');

const SUPPORTED_REPO_HOSTS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'npmjs.com'
];

/**
 * Create a slug from a name
 * - Convert to lowercase
 * - Replace spaces and dots with dashes
 * - Remove any character that isn't alphanumeric or dash
 * - Remove repeated dashes
 * - Remove leading/trailing dashes
 */
function createSlug(name) {
  if (!name) return '';
  return name
      .toLowerCase()
      .replace(/[\s.]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
}

/**
 * Generate a unique ID for a tool (same algorithm as in the build process)
 */
function generateId(tool) {
  // Use the URL if available, otherwise use the name as the basis for the ID
  const idBase = tool.link || tool.repository || tool.name;
  return crypto.createHash('md5').update(idBase).digest('hex');
}


/**
 * Extracts a readable name from a tool object.
 * Prioritizes extracting a slug from GitHub repository URLs.
 * Falls back to the existing name or uses the yaml_id as fallback.
 *
 * Gets the name for a tool, prioritizing in this order:
 * 1. Use existing tool.name if present
 * 2. Extract repository name from GitHub URL if available
 * 3. Fall back to "TOOL #" + fallbackId
 *
 * @param {Object} tool - The tool object containing potential name/repository info
 * @param {string} fallbackId - A fallback ID to use if no better name is found
 * @returns {string} The best available name for the tool
 */
function extractToolName(tool, fallbackId) {
  // First priority: use existing name if it exists and isn't empty
  if (tool.name && tool.name.length > 0) {
    if (Array.isArray(tool.name)) {
      // Join array elements with newlines
      tool.name = tool.name.join('; ');
    }
    return tool.name;
  }

  // Second priority: try to extract name from GitHub repository URL
  if (tool.repository) {
    try {
      // Create a URL object to parse the repository URL
      const repoUrl = new URL(tool.repository);

      // Check if the hostname matches any of our supported domains
      const isSupported = SUPPORTED_REPO_HOSTS.some(domain =>
          repoUrl.hostname.includes(domain)
      );

      if (isSupported) {
        // Repository URLs follow the pattern: host/path/repo[.git]
        const pathname = repoUrl.pathname;
        let fullPath = pathname.replace(/^\//, '').replace(/\.git$/, '');

        if (fullPath && fullPath.includes('/')) {
          // Split by slashes and take the last part (the repo name)
          const pathParts = fullPath.split('/');

          // Return repoName
          return pathParts[pathParts.length - 1];
        }
      }
    } catch (e) {
      // URL parsing failed, continue to final fallback
    }
  }

  // Last resort: use the fallback ID
  return "TOOL #" + fallbackId;
}


/**
 * Gets a string representation of a tool's language
 * Handles cases where language might be an object or array
 *
 * @param {Object} tool - The tool object
 * @returns {string} A string representation of the language
 */
function extractToolLanguage(tool) {
  if (!tool || tool.language === undefined) return null;
  return makeString(tool.language);
}

/**
 * Extracts the best available description from a tool object.
 * Handles string, array, and object descriptions appropriately.
 * Arrays are converted to newline-separated strings.
 *
 * @param {Object} tool - The tool object to extract a description from
 * @returns {string|null} The best available description or an empty string
 */
function extractDescription(tool) {
  // Return null if tool is undefined
  if (!tool) return null;

  // Try each possible description source in order of preference
  const possibleDescriptions = [
    tool.description,
    tool.source_description,
    tool.repositoryMetadata?.description
  ];

  // Find the first non-undefined, non-null description
  for (const desc of possibleDescriptions) {
    if (desc === undefined){
      continue
    }
    if (desc === null) {
      continue;
    }
    return makeString(desc)
  }

  // If no description found, return null
  return null;
}

async function importTools() {
  try {
    console.log('Reading tools.yaml...');
    const toolsYaml = fs.readFileSync(TOOLS_YAML_PATH, 'utf8');
    const tools = yaml.load(toolsYaml);

    console.log(`Loaded ${tools.length} tools from YAML`);

    // Open database connection
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });

    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON');

    // Begin transaction
    await db.run('BEGIN TRANSACTION');

    try {
      // First, extract and insert all unique categories
      const categoryMap = new Map();

      // Process each tool's categories
      for (const tool of tools) {
        const categories = Array.isArray(tool.category)
            ? tool.category
            : (tool.category ? [tool.category] : []);

        for (const category of categories) {
          if (category && !categoryMap.has(category)) {
            const slug = createSlug(category);
            categoryMap.set(category, slug);

            // Insert if not exists
            await db.run(
                'INSERT OR IGNORE INTO category (slug, name) VALUES (?, ?)',
                [slug, category]
            );
          }
        }
      }

      console.log(`Processed ${categoryMap.size} unique categories`);

      // Clear existing data (except category and spec tables)
      await db.run('DELETE FROM support');
      await db.run('DELETE FROM categorization');
      await db.run('DELETE FROM tool');

      // Process each tool
      for (const tool of tools) {
        const yaml_id = tool.id || generateId(tool);
        tool.name = extractToolName(tool, yaml_id)
        tool.language = extractToolLanguage(tool);
        tool.description = extractDescription(tool);

        const result = await db.run(
            `INSERT INTO tool
                (yaml_id, name, description, home_url, repo_url, language, source, manually_categorize, stars)
             VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              yaml_id,
              tool.name,
              tool.description,
              makeString(tool.link),
              makeString(tool.repository),
              makeString(tool.language || tool.repositoryMetadata?.language),
              makeString(tool.source),
              tool.categoryByRequestIndicator ? 1 : 0,
              tool.repositoryMetadata?.stars || 0
            ]
        );

        const toolId = result.lastID;

        // Process categories
        const categories = Array.isArray(tool.category)
            ? tool.category
            : (tool.category ? [tool.category] : []);

        for (const category of categories) {
          if (category) {
            const slug = categoryMap.get(category);
            await db.run(
                'INSERT INTO categorization (tool_id, category_slug) VALUES (?, ?)',
                [toolId, slug]
            );
          }
        }

        // Process OpenAPI version support
        const specs = [{
          slug: 'openapi',
          versions: [
            {version: 'v2.0', supported: tool.v2},
            {version: 'v3.0', supported: tool.v3},
            {version: 'v3.1', supported: tool.v3_1}
          ]
        }];

        for (const spec of specs) {
          for (const version of spec.versions) {
            let supported='?'
            if (version.supported !== undefined) {
              supported = version.supported === true ? 'Y' : (version.supported === false ? 'N' : '?')
            }
            await db.run(
                'INSERT INTO support (tool_id, spec_slug, version, supports) VALUES (?, ?, ?, ?)',
                [
                  toolId,
                  spec.slug,
                  version.version,
                  supported
                ]
            );
          }
        }
      }

      // Commit transaction
      await db.run('COMMIT');
      await db.run('VACUUM');
      console.log(`Successfully imported ${tools.length} tools to the database!`);

    } catch (error) {
      // Rollback on error
      await db.run('ROLLBACK');
      throw error;
    } finally {
      // Close the database
      await db.close();
    }

  } catch (error) {
    console.error('Error importing tools:', error);
    process.exit(1);
  }
}

/**
 * Converts an array of strings to a semicolon separated string
 * and casts any other value to string.
 *
 * @param {string|Array|Object} value
 * @returns {string} A string representation of the value
 */
function makeString(value) {
  for (const _ in [0]) {
    // If it's already a string, return it
    if (typeof value === 'string') {
      break;
    }

    // If it's an array, join the elements
    if (Array.isArray(value)) {
      value = value.join('; ');
      break;
    }

    // If it's an object, try to extract meaningful properties
    if (typeof value === 'object') {
      if ( value == null) {
        break;
      }
      // Option 1: If it has a name property, use that
      if (value.name) {
        value = value.name;
        break;
      }

      // Option 2: Try to get all values and join them
      const values = Object.values(value).filter(val =>
          val !== null && val !== undefined && typeof val !== 'object'
      );

      if (values.length > 0) {
        value = values.join('; ');
        break;
      }
    }
    if (value === undefined) {
      value = null
      break
    }
    if (isScalar(value)){
      value = String(value);
      break;
    }
    value = JSON.stringify(value)
  }
  if (value==='null') {
    value = null;
  }
  return value;
}

/**
 * Determines if a value is a scalar (primitive) in JavaScript.
 * Scalars are: string, number, boolean, undefined, null, symbol, and bigint.
 * Non-scalars are objects and arrays.
 *
 * @param {any} value - The value to check
 * @returns {boolean} True if the value is a scalar, false otherwise
 */
function isScalar(value) {
  // null is a special case - typeof null returns 'object' but it's a primitive
  if (value === null) return true;

  // Check if it's not an object (catches string, number, boolean, undefined, symbol, bigint)
  // Arrays are objects too, so this handles that case as well
  return typeof value !== 'object' && typeof value !== 'function';
}

// Run the import
importTools();












