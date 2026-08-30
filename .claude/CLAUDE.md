# EncFS Tree Browser - Agent Rules

## Project Overview

EncFS Tree Browser is a web application for displaying and navigating EncFS encrypted directory trees with bidirectional name mapping (encoded ↔ decoded). Built with React + Vite + TypeScript for optimal performance with large directory trees.

**Key Features:**
- Scan local directories via File System Access API
- Decode/encode EncFS filenames bidirectionally
- Virtual tree-grid for performant display of large trees
- Lazy loading of directory contents on-demand
- Search, filter, and clipboard functionality
- Configurable columns and view options
- Professional modern UI with plain CSS styling

## Code Style & Conventions

### General Principles
- **Compact and readable**: Minimize lines of code while maintaining clarity
- **Lean comments**: Only comment the WHY when non-obvious. No narrative comments describing what code does.
- **No premature abstractions**: One-off functions > premature helpers. Three similar lines is fine.
- **Strict typing**: Use TypeScript strict mode, no `any` types
- **Security first**: Validate at system boundaries (user input, File System API). Trust internal code.
- **Minimal dependencies**: Use built-in APIs where possible (Web Crypto, File System Access API)
- **Maintainable styling**: Use plain CSS classes instead of inline styles or utility frameworks

### File Structure
```
src/
  ├── components/      # React UI components
  ├── lib/            # Core logic (encfs, tree-building, fs-scanning)
  ├── styles/         # CSS stylesheets
  ├── types/          # Shared TypeScript types
  ├── hooks/          # Custom React hooks
  ├── App.tsx         # Main app component
  ├── main.tsx        # Entry point
  └── index.css       # Global CSS (Tailwind directives)

tests/                # Test files (co-located with source)
  ├── fixtures/       # Test data and vectors
  └── lib/
```

### Naming Conventions
- **Files**: kebab-case (e.g., `name-codec.ts`, `tree-builder.ts`, `app.css`)
- **Components**: PascalCase (e.g., `TreeGrid.tsx`, `ConfigUploader.tsx`)
- **Functions/types**: camelCase
- **Constants**: UPPER_SNAKE_CASE for config constants only
- **Types**: PascalCase with suffix (e.g., `TreeNode`, `ScanResult`, `CodecConfig`)
- **CSS classes**: kebab-case (e.g., `app-container`, `setup-button`)

### React Components
- Use functional components with hooks
- Keep components focused and single-responsibility
- Props should be typed with interfaces (never `any`)
- Memoize expensive renders with `React.memo` when needed
- Use descriptive prop names
- Import CSS classes for styling (e.g., `import './styles/app.css'`)

### CSS Organization
- **Global styles**: `src/index.css` (base HTML, body, reset styles)
- **Component styles**: `src/styles/app.css` (all UI component styling)
- **CSS Variables**: Use CSS custom properties for colors and spacing (`--color-*` for semantic colors)
- **Responsive**: Use media queries for mobile/tablet layouts
- **Maintainability**: Group related styles by component/section with comments

### Testing Strategy
- **Unit tests**: Core logic (encfs codec, tree builder, fs scanner)
- **Critical**: `tests/lib/encfs/name-codec.test.ts` with real encoded/decoded pairs
- **Component tests**: UI interactions (column toggling, expand/collapse, clipboard)
- **Integration tests**: Full flow (config → scan → display)
- Test fixtures in `tests/fixtures/`

### EncFS Implementation
- Parse `.encfs6.xml` with regex-based parsing (Node.js compatible)
- Support Block32 (primary), Stream, Null cipher modes
- Use Web Crypto API (PBKDF2, AES)
- Bidirectional: `decode(encoded) → decoded` and `encode(decoded) → encoded`
- Graceful error handling: return null on decode failure, continue scan
- Support both real EncFS format (boost_serialization) and simplified test format

### Performance Considerations
- **Virtualisation**: TanStack Table + Virtual for rendering only visible rows (~50 rows)
- **Lazy loading**: Scan level 1 initially, load children on-demand via expand
- **Caching**: Cache decoded names and loaded directory contents
- **Debouncing**: Search/filter with 300ms debounce
- **Memoization**: Memoize cell renderers, tree node components

### Error Handling
- Validation at boundaries: config upload, password, directory selection
- Graceful degradation: Single decode failure doesn't fail entire scan
- User feedback: Inline errors in setup phase, error badges in tree view
- Error recovery: Allow editing config after error without full reset

## Development Workflow

### Setup
```bash
npm install
npm run dev      # Dev server on http://localhost:5173
npm run test     # Run tests (Vitest)
npm run build    # Production build
```

### Before Committing
- Run tests: `npm run test`
- Check TypeScript: `npm run type-check` (if configured)
- Manual testing: Test UI in browser for golden path + edge cases

### Architecture Decisions
1. **File System Access API**: Browser native, no server required, Chrome/Edge only
2. **TanStack Table**: Headless UI for maximum control, tree data support, virtualisation
3. **Web Crypto API**: Native browser crypto, no external dependencies for AES/PBKDF2
4. **React hooks**: Simpler state management than context/Redux for this app scope
5. **Plain CSS**: Direct CSS styling over utility frameworks for maintainability and reliability
   - **Why**: Tailwind v4 with @tailwindcss/postcss had compatibility issues with Vite (CSS not generating)
   - **Benefit**: Plain CSS is portable, guaranteed to work, and easier to debug
6. **localStorage**: Config persistence (columns, sort order, recent dirs)

## Key Files & Responsibilities

**Core EncFS Logic:**
- `src/lib/encfs/config-parser.ts` — Parse and validate .encfs6.xml (supports both boost_serialization and simplified formats)
- `src/lib/encfs/name-codec.ts` — Encode/decode EncFS filenames (critical)
- `src/lib/encfs/crypto.ts` — Web Crypto API wrapper (PBKDF2, AES) with Node.js compatibility

**Tree Building:**
- `src/lib/tree-builder.ts` — Lazy tree construction, expand on-demand
- `src/lib/fs-scanner.ts` — File System Access API wrapper

**UI Components:**
- `src/components/TreeGrid.tsx` — Main tree-grid with TanStack Table (performance critical)
- `src/components/ConfigUploader.tsx` — .encfs6.xml drag-and-drop upload
- `src/components/DirectoryPicker.tsx` — File System Access API picker
- `src/components/ModeSelector.tsx` — Encoded/decoded mode selection
- `src/components/MountPointInput.tsx` — Mount point configuration
- `src/components/SearchBar.tsx` — Real-time search input

**Styling:**
- `src/styles/app.css` — All application styling (colors, layout, components)
- `src/index.css` — Global CSS and Tailwind directives

**Testing:**
- `tests/lib/encfs/name-codec.test.ts` — EncFS codec tests with fixtures (MUST PASS)
- `tests/fixtures/encfs-test-vectors.json` — Known encoded/decoded pairs

## Important Constraints

1. **File System Access API** is Chrome/Edge only — no Safari/Firefox support
2. **Password handling**: Keep in memory only, never persist or log
3. **Large trees**: Must support 10,000+ items with smooth scrolling/expand
4. **Mode detection**: Allow user to specify encoded/decoded, don't guess
5. **Column redundancy**: Name (primary) + Alternate (secondary), no Type column (use icon)
6. **Styling**: Plain CSS for maintainability; avoid complex utility frameworks

## Known Issues & Workarounds

1. **Tailwind v4 compatibility**: Tailwind v4 with `@tailwindcss/postcss` did not work correctly with Vite
   - **Solution**: Switched to plain CSS for guaranteed compatibility and easier debugging
   - **Result**: All styling now in `src/styles/app.css` with CSS classes

## Future Enhancements

Priority order (from plan):
1. Config persistence (localStorage)
2. Drag & drop file upload
3. Auto-detect mode
4. Export to CSV/JSON
5. Statistics panel
6. Keyboard navigation
7. Advanced filtering
8. Compare view (split screen)
9. Batch operations
10. Error recovery on partial scan

---

**Last updated**: 2026-08-30  
**Version**: 1.1 (Switched to plain CSS, resolved Tailwind v4 compatibility issues)
