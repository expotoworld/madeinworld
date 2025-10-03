# Ebook Feature Implementation Plan

This document provides a comprehensive, step-by-step guide for implementing the "Ebook Wikipedia" feature. The plan is divided into two main phases, aligning with the discussed strategy of developing the content-creation system first, followed by the mobile app integration.

## Core Technologies
- **Web Editor**: React with the TipTap rich-text editor framework.
- **Backend Service**: Go, consistent with the existing microservices architecture.
- **Database**: PostgreSQL for storing primary content.
- **File Storage**: AWS S3 for version history.
- **Mobile App**: Flutter.


---

## Implementation Summary and Key Differences (Delivered)

This section summarizes what has been implemented and how it differs from the original plan below. It focuses on architectural and product-technical decisions rather than delivery mechanics.

### 1) Content Model and Persistence
- Adopted a singleton ebook model (slug = `main`). The editor always edits the single, authoritative draft.
- Current draft content is stored in PostgreSQL (JSON) for fast load and resilience.
- Historical versions are stored as JSON objects in S3, not in a relational `ebook_versions` table.
  - Three version kinds: `autosave`, `manual`, `published`.
  - Key scheme: `ebook/versions/{kind}/{timestamp}[_{label}].json`.
  - Retention: `autosave` expires after 7 days; `manual` and `published` are retained indefinitely.

Difference vs initial plan: Removed the `ebook_versions` relational table and its `s3_key` index. Version history lives purely in S3 with an explicit key structure and lifecycle policy, while the DB keeps only the latest draft (and minimal metadata).

### 2) Editor and Save/Publish Flow
- Web editor uses TipTap with a Vite-based React app (faster build/dev) instead of Create React App.
- Auto-save is implemented with two safeguards:
  - Debounced save (≈2s after typing stops) to avoid thrashing.
  - Periodic background save (≈10 minutes) to ensure a recent snapshot even if the user never pauses.
- Manual snapshotting creates a named version (`manual`) for milestones.
- Publishing writes an immutable `published` JSON object. The mobile app only consumes the latest published JSON.

Difference vs initial plan: Instead of uploading the “previous DB version” on every save, we append explicit autosave/manual/published objects to S3 with predictable keys and retention, while keeping the working draft in DB. This reduces DB churn and simplifies recovery/version browsing.

### 3) API Surface (Simplified around the singleton)
- Draft
  - `GET /ebook` → returns the current draft JSON (DB).
  - `PUT /ebook` → updates the current draft JSON; creates an `autosave` S3 snapshot.
- Versioning
  - `POST /ebook/versions/manual` → creates a labeled manual snapshot in S3.
  - `POST /ebook/versions/publish` → freezes and writes the published version to S3.
  - `GET /ebook/versions?kind={autosave|manual|published}` → lists version objects (from S3).
- Mobile consumption
  - `GET /ebook/published` → returns the latest published JSON; clients don’t need IDs.

Difference vs initial plan: Replaced ID-centric CRUD (`/ebooks/{id}`) with a singleton-first API and explicit versioning endpoints aligned to the three version kinds.

### 4) Authentication and Roles
- Passwordless sign-in (email code) for the editor site; authenticated “Author” access required to edit and publish.
- JWT-based access control consistent with other services.

Difference vs initial plan: The initial outline didn’t describe auth. The delivered system enforces authenticated authoring and publication.

### 5) Frontend Rendering (Mobile)
- Flutter renders the latest published JSON only. Drafts and autosaves never reach end users.
- The renderer processes headings, paragraphs, inline marks (bold/italic/links), and is extensible for lists, images, tables.
- Internal links are supported via anchor IDs embedded in heading nodes; external links open in the browser.

Difference vs initial plan: Tightened the contract—mobile only renders `published`, reducing risk of exposing unfinished content and simplifying data access.

### 6) Storage and Pathing Decisions
- Single S3 bucket for all ebook versions with explicit foldering under `ebook/versions/...`.
- No reuse of product/store image paths; ebook assets remain isolated for clarity and governance.

Difference vs initial plan: Clarified bucket strategy and file-path boundaries; removed the need for a DB pointer per version.

### 7) Operational Behavior (Product-Level)
- Published content is immutable; correcting published content creates a new published object and supersedes the previous one.
- Autosave noise is naturally trimmed by lifecycle expiry (7 days), keeping the manual/published history clean.
- Version browsing in the editor shows autosave/manual/published separately for clarity.

Difference vs initial plan: Defined immutability and retention guarantees to keep the content lifecycle predictable and safe.

### 8) Delivery & CDN (Live)
- Domain: https://huashangdao.expomadeinworld.com
- CDN: CloudFront distribution E3K8EMLWMXOKXM (d2f6s7gq6jpuus.cloudfront.net)
- TLS: ACM certificate in us-east-1 (arn:aws:acm:us-east-1:834076182408:certificate/b020a887-faa6-43f7-a106-093cf9f0caa3)
- Origin: Private S3 bucket madeinworld-ebook-editor-site-eu-central-1 via OAC (E1BYE1VQSK3V7W)
- SPA routing: 403/404 → /index.html (200)
- Performance: HTTP/2 + HTTP/3, Brotli compression
- Security headers: Managed-SecurityHeadersPolicy attached
- Caching: assets/* long-cache immutable; index.html no-cache; deploy invalidates only /index.html and /

### 9) Authentication & Authorization (Author role)
- Editor requires JWT with role "Author" (or Admin if needed for maintenance)
- ebook-service enforces role via RequireAuthor middleware for write/publish endpoints
- Tokens issued by auth-service include role claim; DB-backed roles now include Author

### 10) Admin Panel Role Management
- Admin Panel user role options now include Author (assignable by Admins)
- Backend user-service validates Author as a legitimate role
- Database enum user_role updated to include 'Author' on both dev and prod Neon branches

---

## Phase 1: Content Creation System (Backend & Web Editor)

**Goal:** To have a fully functional web editor at `huashangdao.expomadeinworld.com` where an author can write and save the book.

### Step 1: Project Scaffolding

1.  **Create React App for the Editor**:
    - In your terminal, navigate to the project root (`/Users/imsolesong/Documents/Work/EXPO Made in World APP/madeinworld`).
    - Create a new directory for the editor: `mkdir ebook-editor`
    - Initialize a new React project: `npx create-react-app ebook-editor`

2.  **Create Go Service for the Backend**:
    - Navigate to the backend directory: `cd backend`
    - Create a new directory for the service: `mkdir ebook-service`
    - To ensure consistency, copy the basic structure (`cmd/`, `internal/`, `Dockerfile`, `build.sh`, `go.mod`) from an existing service like `order-service` into the new `ebook-service` directory.

### Step 2: Database Schema Setup

1.  **Create a New Migration File**:
    - Navigate to `database/migrations/`.
    - Create a new SQL file (e.g., `005_create_ebooks_schema.sql`).

2.  **Add SQL Schema**:
    - Add the following SQL to the new migration file. This creates the necessary tables for storing the ebook content and its version history.
    ```sql
    -- Main table to hold the latest version of the ebook content
    CREATE TABLE ebooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        content JSONB, -- Stores the structured TipTap JSON
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Table to track historical versions stored in S3
    CREATE TABLE ebook_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ebook_id UUID NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
        s3_key VARCHAR(1024) NOT NULL, -- The key to the versioned JSON file in S3
        created_at TIMESTAMPTZ DEFAULT NOW(),
        reason VARCHAR(255) -- e.g., "Auto-saved version"
    );

    -- Add an index for faster lookups
    CREATE INDEX idx_ebook_versions_ebook_id ON ebook_versions(ebook_id);
    ```
3.  **Apply the Migration**: Run your project's standard script for applying database migrations.

... (content continues unchanged)
