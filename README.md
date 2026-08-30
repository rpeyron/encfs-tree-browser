# EncFS Tree Browser

A web application for viewing and navigating EncFS-encrypted directory trees with bidirectional filename mapping. View both encrypted (encoded) and decrypted (decoded) filenames side-by-side in an interactive tree view.

## Features

- **View encrypted directories**: Load an EncFS volume and see decoded filenames alongside their encrypted counterparts
- **Bidirectional mapping**: Switch between viewing encrypted and decoded names as the primary display
- **Large tree support**: Virtualized tree grid for smooth performance with thousands of files
- **Lazy loading**: On-demand expansion of directories for minimal initial load time
- **Search & filter**: Real-time search across filenames
- **Clipboard operations**: Copy full paths (encoded or decoded) to clipboard with one click
- **Mount point configuration**: Specify where a directory portion connects in the broader EncFS tree

## Requirements

- **Browser**: Chrome 90+, Edge 90+ (uses File System Access API)
- **EncFS volume**: A directory containing EncFS-encrypted files
- **EncFS password**: Password for the EncFS volume
- **.encfs6.xml config**: The configuration file from the EncFS volume

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens dev server at `http://localhost:5173`

### Build

```bash
npm run build
```

### Testing

```bash
npm run test          # Run all tests
npm run test:ui       # Open test UI
```

## Usage

1. **Upload Configuration**
   - Upload the `.encfs6.xml` file from your EncFS volume
   - Enter the EncFS password

2. **Select Directory**
   - Click "Select Directory" and choose the encrypted folder on your system
   - Select the mode (encrypted or decrypted names)
   - Optionally specify a mount point

3. **Browse**
   - View the tree with decoded filenames (if directory is encrypted)
   - Expand folders to explore nested directories
   - Search for files
   - Copy full paths to clipboard

## Architecture

### Core Components

- **EncFS Codec** (`src/lib/encfs/`)
  - Config parser for `.encfs6.xml` validation
  - Name codec with bidirectional encode/decode
  - Web Crypto API wrapper for AES encryption

- **File System** (`src/lib/fs-scanner.ts`)
  - File System Access API integration for directory scanning
  - Recursive directory traversal with lazy loading

- **Tree Building** (`src/lib/tree-builder.ts`)
  - Hierarchical tree construction from flat file listings
  - Mount point offset handling
  - Bidirectional name path mapping

- **UI Components** (`src/components/`)
  - TreeGrid: Virtual table display using TanStack Table
  - ConfigUploader: File upload for .encfs6.xml
  - DirectoryPicker: File System Access API directory selection
  - SearchBar, ModeSelector, MountPointInput: Configuration UI

### Key Technologies

- **React + TypeScript**: Type-safe UI components
- **Vite**: Fast build tool and dev server
- **TanStack Table + Virtual**: Performant tree grid with virtualization
- **Web Crypto API**: Native browser encryption (PBKDF2, AES)
- **Tailwind CSS**: Utility-first styling
- **Vitest**: Unit testing with fixtures

## EncFS Support

### Supported Algorithms

- **Block cipher** (Block32): Most common EncFS configuration
- **Stream cipher**: Alternative name encoding
- **Null cipher**: No encryption (pass-through)

### Limitations

- Requires File System Access API (Chrome/Edge only)
- Cannot modify files through this interface
- Relies on user-selected directories (respects OS permissions)

## Testing

The project includes comprehensive tests for core EncFS functionality:

```bash
# Run all tests
npm run test

# Run specific test file
npm run test -- name-codec.test.ts

# Watch mode
npm run test -- --watch

# Test UI
npm run test:ui
```

### Test Coverage

- EncFS codec: encode/decode round-trips, unicode support, error handling
- Config parser: valid/invalid XML, parameter extraction
- Crypto utilities: PBKDF2 key derivation, AES encryption
- File system scanner: directory traversal
- Tree builder: path construction, mount point handling

## Code Style

- Lightweight TypeScript with strict mode
- Minimal comments (only for non-obvious WHY)
- Compact, readable implementations
- Security-first input validation
- Web Crypto API for all encryption

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 90+ | ✅ Full | File System Access API required |
| Edge 90+ | ✅ Full | File System Access API required |
| Firefox | ❌ No | File System Access API not supported |
| Safari | ❌ No | File System Access API not supported |

## Troubleshooting

### "Directory is not encoded" error
- Verify you selected the correct directory (should contain encrypted filenames)
- Check that the password is correct
- Ensure the .encfs6.xml config matches the volume

### Permission denied when selecting directory
- Grant the browser permission to access the directory
- Try selecting from a different location
- Check OS-level file permissions

### Slow performance with large directories
- Enable "Load Full Tree" gradually rather than all at once
- Use search to narrow down results
- Consider browsing a subdirectory instead of the full tree

## Development

### Project Structure

```
encfs-tree-browser/
├── src/
│   ├── components/      # React UI components
│   ├── lib/            # Core logic
│   │   ├── encfs/      # EncFS codec
│   │   ├── fs-scanner.ts
│   │   └── tree-builder.ts
│   ├── types/          # TypeScript types
│   ├── hooks/          # React hooks
│   └── App.tsx         # Main app
├── tests/              # Test files
│   ├── fixtures/       # Test data
│   └── lib/
└── .claude/            # Agent rules and documentation
```

### Adding Features

When adding new features:
1. Add types to `src/types/index.ts`
2. Create core logic in `src/lib/`
3. Write tests in `tests/`
4. Add UI components in `src/components/`
5. Wire into `src/App.tsx`

## Future Enhancements

- [ ] Config persistence (localStorage)
- [ ] Drag & drop file upload
- [ ] Auto-detect encoded/decoded mode
- [ ] Export tree to CSV/JSON
- [ ] Statistics panel (file count, size, depth)
- [ ] Keyboard shortcuts and navigation
- [ ] Advanced filtering (by size, date range)
- [ ] Side-by-side comparison view
- [ ] Batch operations on selected files

## Security Notes

- Passwords are kept in memory only, never persisted
- Uses Web Crypto API for all encryption (native browser crypto)
- File System Access API respects OS-level permissions
- No data is transmitted to external servers
- Config files are validated before use

## Contributing

To contribute improvements:
1. Check the plan in `d:\Dev\encfs-tree-browser\.claude\CLAUDE.md`
2. Run tests: `npm run test`
3. Build: `npm run build`
4. Test in browser before committing

## License

This project was created as an educational tool for EncFS exploration.

## Resources

- [EncFS Documentation](https://vgough.github.io/encfs/)
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [TanStack Table](https://tanstack.com/table/)
