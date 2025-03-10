# OpenAPI Tools Database

This directory contains scripts to create and manage a SQLite database with information about OpenAPI tools from various categories. The database provides a more user-friendly way to edit tool information, which can then be exported back to the original YAML format.

## Files

- `schema.sql` - SQL script to create the database schema and insert specification data
- `import-tools.js` - JavaScript script to import tool data from tools.yaml into the database
- `export-tools.js` - JavaScript script to export tool data from the database back to tools.yaml

## Prerequisites

- Node.js and Yarn must be installed on your system
- SQLite3 must be installed on your system
- Required node packages: `sqlite`, `sqlite3`, `js-yaml`

## Usage

### Setting up the database

```bash
# Install dependencies (if not already done)
yarn install

# Create the database with schema
yarn run db:setup
```

### Importing tools from YAML to SQLite

```bash
yarn run db:import
```

### Exporting tools from SQLite back to YAML

```bash
yarn run db:export
```

## Database Schema

The database has several tables:

### Category Table

- `slug` - Lowercase identifier for the category (PRIMARY KEY)
- `name` - Display name of the category

### Spec Table

- `slug` - Lowercase identifier for the specification (PRIMARY KEY)
- `name` - Display name of the specification
- `blurb` - Short description
- `url` - URL to the specification
- `description` - Long description

### Tool Table

- `id` - Unique identifier for the tool (PRIMARY KEY)
- `yaml_id` - ID used in the tools.yaml file
- `name` - Name of the tool
- `description` - Description of the tool
- `home_url` - URL to the tool's homepage
- `repo_url` - URL to the tool's repository
- `language` - Programming language or "SaaS"
- `source` - Where the tool was discovered
- `manually_categorize` - Boolean indicating if auto-classification should be bypassed
- `stars` - Number of GitHub stars
- `last_edited` - When the tool was last edited in the database

### Categorization Table

- `id` - Unique identifier (PRIMARY KEY)
- `tool_id` - Reference to tool.id
- `category_slug` - Reference to category.slug

### Support Table

- `id` - Unique identifier (PRIMARY KEY)
- `tool_id` - Reference to tool.id
- `spec_slug` - Reference to spec.slug
- `version` - Version string (e.g., "v3.1")
- `supports` - "Y", "N", or "?" indicating support status

## Important Notes

- **Categories in the database are just data storage**. Adding a category to the database does not automatically make it available in the build process or site. Categories must be learned by the Bayesian classifier through tool assignments.
- Always run `yarn run build:data:full` after exporting changes from the database to ensure the build process picks up your changes.
- The import/export process preserves existing metadata like GitHub repository information that is retrieved from the GitHub API.