#!/usr/bin/env node

/**
 * Export tools from SQLite database to tools.yaml
 * 
 * This script reads tools from the SQLite database and exports them back to tools.yaml.
 * It preserves existing metadata like GitHub stars and external source information.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// Paths
const TOOLS_YAML_PATH = path.join(__dirname, '..', 'src', '_data', 'tools.yaml');
const DB_PATH = path.join(__dirname, 'tools.db');
const BACKUP_YAML_PATH = path.join(__dirname, '..', 'src', '_data', `tools.yaml.bak.${Date.now()}`);

async function exportTools() {
  try {
    // Create backup of current tools.yaml
    if (fs.existsSync(TOOLS_YAML_PATH)) {
      console.log(`Creating backup of tools.yaml at ${BACKUP_YAML_PATH}`);
      fs.copyFileSync(TOOLS_YAML_PATH, BACKUP_YAML_PATH);
    }

    // Read current tools.yaml to preserve metadata
    let originalTools = [];
    if (fs.existsSync(TOOLS_YAML_PATH)) {
      const toolsYaml = fs.readFileSync(TOOLS_YAML_PATH, 'utf8');
      originalTools = yaml.load(toolsYaml);
    }
    
    // Create a lookup map by ID for fast access
    const originalToolsMap = new Map();
    for (const tool of originalTools) {
      if (tool.id) {
        originalToolsMap.set(tool.id, tool);
      }
    }

    // Open database connection
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });

    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON');

    // Get all tools with their categories and spec support
    const tools = await db.all(`
      SELECT 
        t.id,
        t.yaml_id,
        t.name,
        t.description,
        t.home_url,
        t.repo_url,
        t.language,
        t.source,
        t.manually_categorize,
        t.stars
      FROM 
        tool t
      ORDER BY
        t.name
    `);

    // Get categories for each tool
    for (const tool of tools) {
      const categories = await db.all(`
        SELECT 
          c.name
        FROM 
          categorization ca
          JOIN category c ON ca.category_slug = c.slug
        WHERE 
          ca.tool_id = ?
        ORDER BY 
          c.name
      `, [tool.id]);

      if (categories.length === 0) {
        tool.category = null;
      } else if (categories.length === 1) {
        tool.category = categories[0].name;
      } else {
        tool.category = categories.map(c => c.name);
      }
    }

    // Get OpenAPI support for each tool
    for (const tool of tools) {
      const supportRecords = await db.all(`
        SELECT 
          s.spec_slug,
          s.version,
          s.supports
        FROM 
          support s
        WHERE 
          s.tool_id = ?
          AND s.spec_slug = 'openapi'
        ORDER BY 
          s.version
      `, [tool.id]);

      // Set OpenAPI version support flags
      tool.v2 = false;
      tool.v3 = false;
      tool.v3_1 = false;

      for (const support of supportRecords) {
        if (support.version === 'v2.0') {
          tool.v2 = support.supports === 'Y';
        } else if (support.version === 'v3.0') {
          tool.v3 = support.supports === 'Y';
        } else if (support.version === 'v3.1') {
          tool.v3_1 = support.supports === 'Y';
        }
      }
    }

    // Prepare final YAML data
    const yamlTools = tools.map(tool => {
      // Start with a new object
      const yamlTool = {};
      
      // Set ID and source
      yamlTool.id = tool.yaml_id;
      if (tool.source) {
        yamlTool.source = tool.source;
      }
      
      // Add core properties
      yamlTool.name = tool.name;
      yamlTool.category = tool.category;
      
      // Only add if not empty
      if (tool.home_url) yamlTool.link = tool.home_url;
      if (tool.repo_url) yamlTool.repository = tool.repo_url;
      if (tool.language) yamlTool.language = tool.language;
      if (tool.description) yamlTool.description = tool.description;
      
      // Add OpenAPI version support
      if (tool.v2 !== undefined) yamlTool.v2 = tool.v2;
      if (tool.v3 !== undefined) yamlTool.v3 = tool.v3;
      if (tool.v3_1 !== undefined) yamlTool.v3_1 = tool.v3_1;
      
      // Add manual categorization flag if true
      if (tool.manually_categorize) {
        yamlTool.categoryByRequestIndicator = true;
      }
      
      // Preserve other metadata from original file
      const originalTool = originalToolsMap.get(tool.yaml_id);
      if (originalTool) {
        // Repository metadata (don't override with empty values)
        if (originalTool.repositoryMetadata) {
          yamlTool.repositoryMetadata = originalTool.repositoryMetadata;
        }
        
        // Other metadata fields to preserve
        if (originalTool.foundInMaster) {
          yamlTool.foundInMaster = originalTool.foundInMaster;
        }
        
        if (originalTool.source_description && !yamlTool.description) {
          yamlTool.source_description = originalTool.source_description;
        }
      }
      
      return yamlTool;
    });

    // Write to tools.yaml
    const yamlContent = yaml.dump(yamlTools, {
      lineWidth: -1, // Don't wrap lines
      noRefs: true,  // Don't use references
      quotingType: '"' // Use double quotes
    });

    fs.writeFileSync(TOOLS_YAML_PATH, yamlContent, 'utf8');
    console.log(`Successfully exported ${yamlTools.length} tools to ${TOOLS_YAML_PATH}`);

    // Close the database
    await db.close();

  } catch (error) {
    console.error('Error exporting tools:', error);
    process.exit(1);
  }
}

// Run the export
exportTools();