# EncFS Tree Browser - Functional Requirements

## Overview

EncFS Tree Browser is a web application for browsing and navigating EncFS-encrypted directory trees. It enables users to view both encoded (encrypted) and decoded (plaintext) filenames simultaneously, making it easy to understand the encryption mapping and navigate encrypted directories.

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
- Configuration persists in localStorage

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
- **Full Path**: Include complete path from root to current node (applying mount point)
- **Feedback**: Visual confirmation (✓ toast) when copied
- **Keyboard Support**: Ctrl+C on selected row copies main path

### 6. EncFS Name Encoding/Decoding
- **Supported Algorithms**:
  - Block cipher (Block32 - primary)
  - Stream cipher
  - Null cipher (no encryption)
- **Bidirectional**: Both encode and decode operations
- **Error Handling**: Single decode failure doesn't fail entire scan; mark item with warning
- **Support for**:
  - Various key sizes (128, 192, 256-bit AES)
  - UTF-8 filenames
  - Long filenames (handled via block chaining)
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

## Non-Functional Requirements

### Performance
- **Virtual Scrolling**: Only render visible rows (~50 at a time)
- **Lazy Loading**: Initial load < 1s for level 1 (1000+ items)
- **Search**: Debounce 300ms, return results instantly
- **Large Trees**: Support 10,000+ nodes smoothly
- **Memory**: Cache decoded names, reuse computation

### Browser Support
- **Primary**: Chrome 90+, Edge 90+ (File System Access API)
- **Fallback**: None (requires File System Access API)
- **Note**: Safari and Firefox not supported

### Security
- **Password**: Kept in memory only, never logged or persisted
- **Crypto**: Use Web Crypto API (native browser crypto)
- **Input Validation**: Validate config and user input at boundaries
- **File Access**: Only through File System Access API (user-authorized)

### Accessibility
- Semantic HTML (table structure for tree)
- Keyboard navigation fully supported
- ARIA labels for interactive elements
- Color contrast sufficient for readability
- Icons have text alternatives

### Code Quality
- TypeScript strict mode
- No `any` types
- Test coverage for crypto logic and tree building
- Unit tests for core algorithms
- Component tests for UI interactions

## Out of Scope (Phase 2+)

- Batch file operations (delete, move, etc.)
- Compare view (side-by-side encoded/decoded)
- Export to CSV/JSON
- Advanced filtering (by size, date range, file type)
- Settings persistence in cloud
- Command-line interface
- Server-side mounting
- Real-time sync with live EncFS mount

---

**Created**: 2026-08-30  
**Status**: Initial specification  
**Version**: 1.0
