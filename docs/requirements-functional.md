# EncFS Tree Browser — Functional Requirements

## Overview

EncFS Tree Browser is a web application for browsing and navigating EncFS-encrypted directory trees. It enables users to view both encoded (encrypted) and decoded (plaintext) filenames simultaneously, making it easy to understand the encryption mapping and navigate encrypted directories.

Technical constraints, architecture and code style live in [requirements-technical.md](requirements-technical.md).

## Core Features

### 1. Configuration & Setup
- **Header order**: logo, then the **configuration cluster** (dropdown, edit button,
  password), then the tabs **⚡ Convert | 🌳 Browse**, then — on Browse — the directory
  line. All controls share a uniform 30 px height; the header **wraps responsively**
  on narrow screens instead of overflowing
- **Header configuration cluster**: the cluster sits **before the tabs**; its dropdown
  lists user configs saved in localStorage first, then configs dropped in `conf/`
  (gitignored, auto-registered as built-ins named after the file), then the bundled
  sample fixtures (password `test`), and finally a special
  **"➕ Add configuration…"** entry that opens the add modal. Each configuration holds
  **one `.encfs6.xml` + one password** (crypto only)
- **First run**: the dropdown shows the placeholder **"Select or add configuration…"**
  and the password field is disabled; on later launches the **last used configuration**
  is restored (deleting it returns to the placeholder)
- **Add config**: selecting the "Add…" dropdown entry opens a **modal** (name + upload
  `.encfs6.xml` + **Remember password** checkbox) saved to localStorage
- **Edit/Delete config**: the button right beside the dropdown opens the same modal for
  the active config (rename, replace xml, Remember, delete) — enabled for user configs
  only; samples show a lock 🔒 (read-only; duplicating into a user config is possible
  via "Add configuration…")
- **Password entry**: input beside the dropdown (disabled until a config is selected);
  default is memory-only. The modal's
  opt-in **"Remember password" checkbox** stores the password in cleartext in
  localStorage for that configuration; unchecking strips it on the next save
- **Single directory** (Browse tab, shown only when the browser supports the File
  System Access API): the directory line sits in the header right of the Browse tab and
  defines:
  - **Select directory…** button (File System Access API)
  - a **mode**: whether names on disk are encoded or decoded
  - a **mount point** — shown **only when the active config enables name chaining**
    (`chainedNameIV`); it grafts the directory into the displayed tree and seeds the
    chained-IV walk
  - a **Scan** button right after the mode/mount controls
- **Sample path lists**: built-in samples ship with the EncFS 1.9.5 fixture file list
  (`src/assets/configs/*.samples*.txt`), loadable in the Convert tab in the form
  matching the selected direction (decoded list for Encode, encoded list for Decode)
- The directory binding is **separate from the configuration** (persisted under
  `encfs-tree-steps:<configId>`)

**Validation & Error Handling:**
- Validate `.encfs6.xml` format on codec creation (wrong password rejected by MAC check)
- Allow re-entry of password if decode fails
- Support for editing configuration without full reset
- Graceful error messages with recovery options

### 2. Directory Scanning & Tree Display
- **Lazy Loading**: FSA-backed scan retrieves only the requested level; children are
  loaded on demand
- **On-Demand Expansion**: toolbar actions **▾ Expand 1 level**, **▾▾ Expand all**,
  **▴ Collapse all**
- **Bidirectional Naming**:
  - If directory is encoded: show decoded names, with encoded variant visible
  - If directory is decoded: show encoded names, with decoded variant visible
  - **Swap toggle** (⇄) flips which of encoded/decoded is the primary column,
    without re-scanning (preference persisted in localStorage)
- **Sort toggle (A→Z Sort)**: alphabetical sort of names at the root and inside every
  directory, by the **displayed primary name** (decoded or encoded following the
  current display); persisted in localStorage
- Views: **Convert** (list encode/decode, first tab) and **Browse** (directory tree);
  the Browse tab is **hidden when the browser lacks the File System Access API**
- The tree area occupies all vertical space left (toolbar + grid only; the directory
  line lives in the header)
- **Directory Persistence**: directory handles are stored in IndexedDB (`encfs-db`,
  object store `handles`, key `dir:<configId>:<stepId>`) and re-requested on next load
- **Theming**: light/dark appearance follows the system preference
  (`prefers-color-scheme`)

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
- Preferences persist in localStorage (`encfs-tree-prefs`); directory handles persist
  in IndexedDB

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
- **Copy Path Buttons**: Each row has 2 buttons pairing a clipboard icon with the
  name representation: **📋🔒** copies the full encoded path, **📋🔓** copies the full
  decoded path
- **Full Path**: complete path from root to current node (all parent directories plus
  the filename), in the respective representation
- **Feedback**: Visual confirmation (✓) when copied
- **Keyboard Support**: Ctrl+C on selected row copies main path

### 5c. Convert Tab
- **Input**: a textbox (one name or full path per line) **or** a loaded `.txt` file,
  **or** the **📄 Sample list** button (built-in samples: loads the fixture path list in
  the form matching the selected direction)
- **Direction toggle**: Encode or Decode (one direction at a time)
- **Views**: results as a **table** (input | output, failed lines highlighted in red)
  or as a **tree** — the tree uses the **same component, toolbar and behaviour as
  Browse** (search, sort, expand/collapse, swap primary, copy buttons), built from the
  converted input/output path pairs
- **Copy all**: copies every converted output, one per line
- Needs only the active configuration + password (no directory); a failed line is
  reported per row and never aborts the batch
- A single path is converted by entering it alone in the textbox

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
- **Persistence** (localStorage): active configuration id, user configurations, directory
  binding per configuration, display preferences (primary column, sort), optionally the
  password (opt-in, cleartext)

### 8. Error States & Recovery
- **Invalid Config**: Show error with option to re-upload
- **Wrong Password**: Show error, allow re-entry, continue with partial results
- **Permission Denied**: Show instructions and retry option
- **Decode Errors**: Mark affected items, show count of errors, suggest password review
- **Partial Failures**: Continue scanning even if individual items fail

### 9. Standalone Single-File Build
- `npm run build:standalone` bundles the whole app (JS, CSS, sample `.encfs6.xml`
  configs) into one self-contained `dist-standalone/encfs-browser.html`
- Runs offline from disk (`file://`), no server required

## User Flows

### Flow 1: Browse Encrypted Directory (Chrome/Edge)
1. Header: pick a configuration in the dropdown (samples first entry is user list,
   samples last, "Add configuration…" opens the modal)
2. Enter the password (optionally check "Remember password" in the modal)
3. Browse tab: **📂 Select directory…**, set mode (mount point appears only for
   chainedNameIV configs), click **🔍 Scan**
4. Decoded names + encoded alternates; expand, search, sort, swap, copy 📋🔒/📋🔓

### Flow 2: Swap / Sort Display
1. Tree loaded from a directory (either mode)
2. Toolbar **⇄ Swap** flips which representation is the primary column, no re-scan
3. Toolbar **A→Z Sort** toggles alphabetical ordering by the displayed name at the
   root and inside every directory

### Flow 3: Convert Lists
1. Header: select configuration + password
2. Convert tab: paste names/paths, load a file, or **📄 Sample list** (matches the
   selected direction), choose Encode or Decode
3. Convert → inspect table or tree view (same tree as Browse), copy results

### Flow 4: Search & Filter
1. User has loaded directory tree
2. User enters search term in search bar
3. Results filter in real-time (debounced)
4. Matching items highlighted
5. User can copy matching path directly

### Flow 5: Handle Errors
1. Invalid password → re-enter password
2. Scan fails → error banner with recovery, configuration preserved
3. Config invalid → replace the xml of the active user configuration

## Out of Scope

- Modifying files or directories
- Network/cloud EncFS mounts beyond what the browser can open
- Encryption/decryption of file contents (only filename display)
- Multi-user/collaboration features
- Full EncFS configuration editing
- Guessing the encoded/decoded mode (the user always specifies it)

## Assumptions

- Users have access to the `.encfs6.xml` config file from their EncFS volume
- Users know their EncFS password
- Directory browsing needs the File System Access API (Chrome/Edge); elsewhere the
  Browse tab is hidden and only the Convert tab is available
- Directory structure follows standard filesystem hierarchy
- Mount points are given in the on-disk namespace of the directory

