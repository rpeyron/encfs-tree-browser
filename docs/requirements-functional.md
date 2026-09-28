# EncFS Tree Browser — Functional Requirements

## Overview

EncFS Tree Browser is a web application for browsing and navigating EncFS-encrypted directory trees. It enables users to view both encoded (encrypted) and decoded (plaintext) filenames simultaneously, making it easy to understand the encryption mapping and navigate encrypted directories.

Technical constraints, architecture and code style live in [requirements-technical.md](requirements-technical.md).

## Core Features

### 1. Configuration & Setup
- **Upload EncFS Config**: Users upload the `.encfs6.xml` configuration file from an EncFS volume
- **Password Entry**: Users provide the EncFS password for decryption
- **Directory Selection**: Users select a local directory via File System Access API (the portion of the tree to display)
- **Mode Selection**: Users specify whether the selected directory contains encoded or decoded filenames
- **Mount Point**: Users optionally specify where this directory portion connects in the broader EncFS tree (default: "/")

**Validation & Error Handling:**
- Validate `.encfs6.xml` format on upload
- Allow re-entry of password if decode fails
- Support for editing configuration without full reset
- Graceful error messages with recovery options

### 2. Directory Scanning & Tree Display
- **Lazy Loading**: Initial scan retrieves only top-level directory (root + direct children)
- **On-Demand Expansion**: When user expands a folder, load its children from disk
- **Recursive Loading**: Option for users to load entire tree at once ("Expand All" / "Load Full Tree")
- **Performance**: Virtual scrolling for smooth display of large trees (1000+ items)
- **Bidirectional Naming**:
  - If directory is encoded: show decoded names, with encoded variant visible
  - If directory is decoded: show encoded names, with decoded variant visible
  - Mapping togglable per row
- **Directory Persistence**: The selected directory handle is stored in IndexedDB (`encfs-db`,
  object store `handles`, key `dir`) and re-requested on next load, so the user does not
  have to re-select the directory when restarting the app.

### 3. Columns & Display
**Primary columns:**
- **Name** (with icon): Main filename with file/folder icon (📁 or 📄)
  - Decoded if mode = "encoded"
  - Encoded if mode = "decoded"
- **Alternate**: The other representation (encoded or decoded)
- **Size**: File size formatted (KB, MB, GB)
- **Modified**: Last modified date (relative format: "2h ago", "3 days ago")
- **Actions**: Copy buttons (main path and alternate path)

**Column Management:**
- Show/hide columns via dropdown menu
- Reorder columns by dragging header
- Resize columns by dragging column border
- Configuration persists in localStorage (config XML, mode, mount point, directory name);
  the directory handle itself persists in IndexedDB

### 4. Navigation & Interaction
- **Expand/Collapse**:
  - Click expand icon (▶) to toggle single level
  - Shift+click expand icon to toggle entire subtree recursively
  - Keyboard: → to expand, ← to collapse, Space to toggle
- **Row Selection**: Click row to select; Ctrl+click for multiple; Shift+click for range
- **Sorting**: Click column header to sort (asc/desc/none)
- **Search/Filter**: Real-time search across visible columns with debouncing (300ms)
- **Keyboard Shortcuts**:
  - ↑↓: Navigate rows
  - →←: Expand/collapse
  - Ctrl+F: Focus search
  - Ctrl+C: Copy path
  - Esc: Clear selection/search
  - Ctrl+E: Export

### 5. Clipboard Operations
- **Copy Path Buttons**: Each row has 2 buttons:
  - Copy main path (encoded or decoded based on mode)
  - Copy alternate path (the other representation)
- **Full Path**: Include complete path from root to current node (all parent directories plus
  the filename) — the encoded button copies the full encoded path and the decoded button copies
  the full decoded path
- **Feedback**: Visual confirmation (✓ toast) when copied
- **Keyboard Support**: Ctrl+C on selected row copies main path

### 5b. Path Converter
- **Convert path input**: A field in the display toolbar accepts a full path; the app converts
  every segment (decode or encode) and shows the result
- **Result display**: The converted path appears on its own line directly below the input row
  (inside `.convert-bar`), alongside a clipboard button (📋) to copy it
- **Enter** triggers decode; a **Decode** and an **Encode** button trigger the respective
  direction

### 6. EncFS Name Encoding/Decoding
- **Supported Algorithms**:
  - Block cipher (nameio/block - primary)
  - Stream cipher (nameio/stream)
  - Null cipher (no encryption) — **not implemented** in `encfs-filename-codec`
- **Key derivation**: EncFS `BytesToKey` (SHA‑1, 16 rounds) from the volume password,
  yielding key + IV material; the volume key is then decrypted from `encodedKeyData`
  with AES‑CFB (IV = the 4‑byte checksum prefix)
- **Name cipher (Block)**: PKCS7‑style padding to the AES block size, a 2‑byte MAC‑16
  prefix (fold of HMAC‑SHA1 MAC‑64), then AES‑CBC with a per‑name IV derived from the
  MAC via HMAC‑SHA1 over the volume's IV data
- **Name cipher (Stream)**: double‑pass AES‑CBC with shuffle/flip byte permutation
- **Bidirectional**: Both encode and decode operations
- **Filename encoding**: EncFS custom base64 (alphabet `,-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz`)
  via `changeBase2` (8‑bit→6‑bit bit‑stream), producing filename‑safe characters
  (no `/`, `+`, `=`)
- **Error Handling**: Single decode failure doesn't fail entire scan; a failed
  conversion keeps the raw (un‑converted) name on that row so the scan continues
- **Support for**:
  - Various key sizes (128, 192, 256-bit AES)
  - UTF-8 filenames
  - Special characters

### 7. View Options & Preferences
- **Statistics Panel** (optional): Show totals (file count, folder count, total size, max depth)
- **Load Full Tree**: Option to pre-load entire tree recursively
- **Configuration Persistence**: Store in localStorage:
  - Visible columns and order
  - Sort order
  - Recently used directories
  - Preferred mode (encoded/decoded)
  - Theme preference

### 8. Error States & Recovery
- **Invalid Config**: Show error with option to re-upload
- **Wrong Password**: Show error, allow re-entry, continue with partial results
- **Permission Denied**: Show instructions and retry option
- **Decode Errors**: Mark affected items, show count of errors, suggest password review
- **Partial Failures**: Continue scanning even if individual items fail

## User Flows

### Flow 1: Browse Encrypted Directory
1. User uploads `.encfs6.xml` config
2. User enters EncFS password
3. User selects an encrypted directory via File System Access API
4. User selects "Encoded" mode
5. App scans level 1, shows tree with decoded names + encoded alternates
6. User expands folders on-demand to navigate
7. User can copy decoded paths to clipboard

### Flow 2: Compare Encrypted vs Decrypted
1. User uploads config and password
2. User selects the encrypted directory → mode "Encoded"
3. User navigates and views bidirectional mapping
4. User can optionally load decrypted directory → mode "Decoded"
5. User compares paths between the two views

### Flow 3: Search & Filter
1. User has loaded directory tree
2. User enters search term in search bar
3. Results filter in real-time (debounced)
4. Matching items highlighted
5. User can copy matching path directly

