-- SQLite script to create and populate OpenAPI tools database

PRAGMA foreign_keys = ON;

-- =========================================================================
-- IMPORTANT: CATEGORIES MUST BE DEFINED IN THE BUILD PROCESS, NOT JUST HERE
-- Adding a category here only adds it to the database, but does NOT make it 
-- available in the build process or site generation. Categories must be 
-- learned by the Bayesian classifier through tool assignments.
-- =========================================================================
DROP TABLE IF EXISTS category;
CREATE TABLE IF NOT EXISTS category (
   slug TEXT PRIMARY KEY CHECK(slug = LOWER(slug)),
   name TEXT NOT NULL
);

DROP TABLE IF EXISTS spec;
CREATE TABLE IF NOT EXISTS spec (
   slug TEXT PRIMARY KEY CHECK(slug = LOWER(slug)),
   name TEXT NOT NULL UNIQUE,
   blurb TEXT,
   url TEXT,
   description TEXT
);

-- Insert specifications
INSERT INTO
   spec (slug, name, url, blurb, description)
VALUES
   ('openapi', 'OpenAPI', 'https://spec.openapis.org/oas/latest.html','The core OpenAPI specification', 'The OpenAPI Specification (OAS) defines a standard, programming language-agnostic interface description for HTTP APIs, which allows both humans and computers to discover and understand the capabilities of a service without requiring access to source code, additional documentation, or inspection of network traffic. When properly defined via OpenAPI, a consumer can understand and interact with the remote service with a minimal amount of implementation logic. Similar to what interface descriptions have done for lower-level programming, the OpenAPI Specification removes guesswork in calling a service.'),
   ('arazzo', 'Arazzo','https://spec.openapis.org/arazzo/latest.html', 'The OpenAPI workflow specification', 'The Arazzo Specification defines a standard, programming language-agnostic mechanism to express sequences of calls and articulate the dependencies between them to achieve a particular outcome, or set of outcomes, when dealing with API descriptions (such as OpenAPI descriptions).'),
   ('overlay', 'Overlay','https://spec.openapis.org/overlay/latest.html', 'A specification for augmenting OpenAPI documents','The Overlay Specification defines a document format for information that augments an existing [OpenAPI] description yet remains separate from the OpenAPI description''s source document(s).');

DROP TABLE IF EXISTS tool;
CREATE TABLE IF NOT EXISTS tool (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   yaml_id TEXT UNIQUE, -- Preserves the ID from tools.yaml
   name TEXT NOT NULL,  -- Not UNIQUE to allow tools with same name but different IDs
   description TEXT,
   language TEXT,
   repo_url TEXT,
   home_url TEXT,
   source TEXT, -- Where the tool was originally discovered
   manually_categorize BOOLEAN DEFAULT FALSE, -- Prevents auto-classification (was categoryByRequestIndicator)
   stars INTEGER, -- From GitHub metadata
   last_edited TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS categorization;
CREATE TABLE IF NOT EXISTS categorization (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   tool_id INTEGER NOT NULL,
   category_slug TEXT NOT NULL CHECK(category_slug = LOWER(category_slug)),
   FOREIGN KEY (tool_id) REFERENCES tool(id) ON DELETE CASCADE,
   FOREIGN KEY (category_slug) REFERENCES category(slug) ON DELETE CASCADE,
   UNIQUE(tool_id, category_slug)
);

DROP TABLE IF EXISTS support;
CREATE TABLE IF NOT EXISTS support (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   tool_id INTEGER NOT NULL,
   spec_slug TEXT NOT NULL,
   version TEXT NOT NULL CHECK(version LIKE 'v%.%' OR version LIKE 'v%.%.%'),
   supports TEXT DEFAULT '?' CHECK(supports IN ('?','Y','N')),
   FOREIGN KEY (tool_id) REFERENCES tool(id) ON DELETE CASCADE,
   FOREIGN KEY (spec_slug) REFERENCES spec(slug) ON DELETE CASCADE,
   UNIQUE(tool_id, spec_slug, version)
);

-- Create indexes for better performance
CREATE INDEX idx_tool_name ON tool(name);
CREATE INDEX idx_categorization_tool_id ON categorization(tool_id);
CREATE INDEX idx_categorization_category_slug ON categorization(category_slug);
CREATE INDEX idx_support_tool_id ON support(tool_id);
CREATE INDEX idx_support_spec_version ON support(spec_slug, version);