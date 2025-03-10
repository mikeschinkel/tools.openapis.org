# OpenAPI Tooling Project Guidelines

This document is maintained by Claude Code, and updated when someone asks a question about how to work with the repo and the answer appears to be one that should be recorded for posterity.

## Development Environment Requirements

To develop and build this project, you need:

### Required CLI Programs
- **Node.js** - Core runtime environment
- **Yarn** - Package manager (version 1.22.19 recommended)
- **Git** - For version control
- **SQLite3** - For database operations

### Node Dependencies
The following tools are installed automatically via yarn/npm dependencies:
- **Eleventy (@11ty/eleventy)** - Static site generator
- **Gulp** - Build automation tool
- **Webpack** - Frontend asset bundling
- **npm-run-all** - Tool for running multiple npm scripts
- **rimraf** - Cross-platform tool for removing files/directories

### Environment Variables
The following are required for GitHub API access:
```bash
GH_API_USERNAME=<your GitHub username>
GH_API_TOKEN=<your GitHub personal access token>
GH_API_CONCURRENCY_LIMIT=2  # Recommended value
```

These can be set in a `.env` file at the project root.
### Debugging Scripts

#### Using WebStorm

To debug the import/export scripts in WebStorm:

1. **Create a Run/Debug Configuration:**
   - Go to Run → Edit Configurations
   - Click "+" and select "Node.js"
   - Name it (e.g., "Debug Import Script")
   - Set JavaScript file to `/path/to/repo[/subdir]/the-script-to-debug.js` 
   - Set working directory to `/path/to/repo[/subdir]`
   - Click "OK"

2. **Set Breakpoints:**
   - Open the script file
   - Click in the gutter next to the line numbers to set breakpoints
   - You can add conditional breakpoints by right-clicking on a breakpoint

3. **Start Debugging:**
   - Click the debug icon (bug) next to the run configuration
   - The script will pause at your breakpoints
   - Use the debug panel to inspect variables, step through code, etc.

#### Using VS Code

1. **Create a Launch Configuration:**
   - Go to the Run and Debug view (Ctrl+Shift+D or Cmd+Shift+D)
   - Click "create a launch.json file"
   - Select "Node.js"
   - Add a configuration like this:
   ```json
   {
     "type": "node",
     "request": "launch",
     "name": "Debug Import Script",
     "program": "${workspaceFolder}/db/import-tools.js",
     "cwd": "${workspaceFolder}"
   }
   ```

2. **Set Breakpoints and Debug:**
   - Set breakpoints by clicking in the gutter
   - Select your configuration from the dropdown
   - Click the green play button to start debugging

## Commands
- Build data: `yarn run build:data:full` or `yarn run build:data:metadata`
- Build site: `yarn run build:site`
- Build all: `yarn run build:all`
- Test: `yarn run test`
- Run single test: `NODE_ENV=test mocha --exit test/unit/lib/path/to/test.js`
- Coverage: `yarn run coverage`
- Clean: `yarn run clean`
- Serve locally: `yarn run serve`
- Database setup: `yarn run db:setup`
- Import tools to DB: `yarn run db:import`
- Export tools from DB: `yarn run db:export`

## Understanding `tools.yaml`

### Location and Purpose
There are two `tools.yaml` files in the repository with different purposes:

1. **src/_data/tools.yaml (11.6MB)**:
   - Primary data source for the website
   - Contains the full production dataset of all OpenAPI tools
   - Includes complete metadata (GitHub repository info, stars, etc.)
   - Used by the 11ty static site generator through the tooling.js module

2. **test/data/site/tools.yaml (7.1MB)**:
   - Static test fixture used exclusively for unit tests
   - Manually created as a smaller subset of the production data
   - Used in tests for functions like `getToolsByCategory` and `Classifier`
   - Never modified by the build process

The size difference reflects the production file containing more tools and more complete metadata for each tool.

### Generation Process
The `tools.yaml` file is generated through Gulp-based build processes:
- **Full build** (`build:data:full`): Retrieves data from multiple sources (GitHub tagged repos, openapi.tools, repository issues), merges them, normalizes properties, adds GitHub metadata, classifies tools, and writes to `src/_data/tools.yaml`
- **Metadata update** (`build:data:metadata`): Updates metadata for existing tools without adding new ones
- Both processes use transformation functions in `lib/data/transform/` directory
- Sources are defined in `gulpfile.js/metadata.json`

### Data Flow
1. Data is collected from various sources
2. Processed through transformation pipeline
3. Written to src/_data/tools.yaml
4. Loaded by tooling.js which adds display-friendly fields
5. Used by 11ty templates to generate the static site

When using the SQLite database to edit tools, you're modifying this central src/_data/tools.yaml file (via the export-tools.js script), which is then used to rebuild the site.

### Fields of note

#### Description fields

There are several description fields that serve different purposes:

1. **`description`**:
   - Manually entered by a user through direct edits or via the SQLite database
   - Has priority when displaying tool information
   - Should be used when you want to override automated descriptions with custom content

2. **`source_description`**:
   - Automatically pulled from external sources during the build process
   - Created during the normalization process in `lib/data/transform/normalise-sources.js`
   - Original sources include:
     - The openapi.tools website's tools.yml file
     - GitHub issues that follow a specific template with a "Description" field
   - Used as a fallback when neither `description` nor `repositoryMetadata.description` are available

3. **`repositoryMetadata.description`**:
   - Pulled from GitHub API when repository information is available
   - Automatically updated during metadata builds
   - Used before `source_description` but after manual `description`

The priority order for display is:
1. Manual `description` (if available)
2. `repositoryMetadata.description` (if available)
3. `source_description` (as a fallback)

This approach allows users to override automated descriptions while still maintaining original source information.

## Adding a New Tool
To add a specific new tool, add the following minimal YAML to `src/_data/tools.yaml`:

```yaml
- name: "Tool Name"
  link: "https://example.com/tool"
  category: "Category Name"
```

Additional helpful fields include:
- `repository`: GitHub repository URL if available
- `language`: Programming language or "SaaS" for hosted services
- `description`: A short description of what the tool does
- `v2`, `v3`, `v3_1`: Boolean flags indicating OpenAPI version support

After adding the entry, run `yarn run build:data:full` to process the tool and update the site.

## SQLite Database for Editing Tools

A SQLite database is available for easier editing of tool information:

1. **Setup the database:**
   ```bash
   yarn run db:setup
   ```

2. **Import tools from YAML:**
   ```bash
   yarn run db:import
   ```

3. **Edit tools using a SQLite GUI** like JetBrains DataGrip, SQLite Browser, or another tool of your choice.

4. **Export back to YAML:**
   ```bash
   yarn run db:export
   ```

5. **Rebuild the site:**
   ```bash
   yarn run build:data:full
   yarn run build:site
   ```

The database schema is designed to handle all editable aspects of tools, including categories and specification version support. See the `db/README.md` file for more details on the schema design and usage.

## Adding a New Category of Tools
To add a new category (e.g., "New Category"):

1. **Identify Relevant Tools:**
   - Find existing tools that should belong to the new category

2. **Update tools.yaml:**
   - Manually add the category to these tools in `src/_data/tools.yaml`:
   ```yaml
   - name: "Example Tool"
     # other properties
     category: "New Category"
     categoryByRequestIndicator: true  # Prevents auto-classification
   ```

3. **Build and Verify:**
   - Run `yarn run build:data:full` to update the tools data
   - This will teach the Bayesian classifier about the new category
   - Run `yarn run build:site` and `yarn run serve` to verify the category page

4. **How It Works:**
   - The system uses a Bayesian classifier (`lib/data/transform/classifer.js`)
   - Categories are learned from README content and existing assignments
   - Categories are normalized with proper capitalization
   - The site generator automatically creates category pages

## Code Style
- Follow Airbnb ESLint rules (extends airbnb-base)
- Use CommonJS requires for imports (not ES6 imports)
- Separate logic from Gulp build process - keep logic in `lib/`
- Unit tests with Mocha/Chai in `test/unit/lib/` matching source structure
- Use descriptive variable names and function names
- Error handling with proper rejection and error propagation
- Use async/await pattern for asynchronous operations
- Document functions with descriptive comments
- Keep functions small and focused on a single responsibility
- Add `.env` file for environment variables (see README for required vars)