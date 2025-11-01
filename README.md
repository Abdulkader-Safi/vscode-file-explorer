# File Explorer

A modern, feature-rich file explorer for Visual Studio Code with an intuitive webview interface. Browse your file system, preview images, manage favorites, and perform common file operations without leaving your editor.

## Features

### Enhanced File Navigation

- **Custom File Explorer UI**: Beautiful, responsive interface for browsing directories
- **Quick Navigation**: Navigate up directories, jump to home directory, or browse to any path
- **Dual View Modes**: Switch between list and grid views for optimal file browsing
- **Image Previews**: Inline image previews for JPEG, PNG, GIF, SVG, and WebP files
- **File Type Recognition**: Automatic detection and display of file types with appropriate icons

### File Operations

- **Create Files & Folders**: Quickly create new files and folders from within the explorer
- **Rename**: Rename files and folders with a simple inline interface
- **Delete**: Safely delete files and folders with confirmation dialogs
- **Copy Path**: Copy full file paths to clipboard with a single click

### Productivity Features

- **Favorites**: Bookmark frequently accessed directories for quick access
- **Hidden Files Toggle**: Show or hide hidden files (files starting with `.`)
- **Persistent Settings**: Your view preferences, favorites, and settings are saved between sessions
- **Context Menu**: Right-click context menu for common file operations

### File Opening

- **Direct Integration**: Open files directly in VS Code editor with a single click
- **Non-Preview Mode**: Files open in dedicated tabs (not preview mode) for better workflow

## Usage

1. **Open the File Explorer**:

   - Use the Command Palette (`Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux)
   - Type "File Explorer" and select the command
   - Or click the File Explorer icon in the activity bar

2. **Navigate Directories**:

   - Click on folders to open them
   - Use the "Up" button to navigate to parent directory
   - Use the "Home" button to jump to your home directory

3. **Manage Files**:

   - Right-click on files/folders for context menu options
   - Use the "+" buttons in the toolbar to create new files or folders
   - Click on files to open them in the editor

4. **Customize View**:
   - Click the settings icon to toggle hidden files visibility
   - Switch between list and grid views using the view mode buttons
   - Add directories to favorites using the star icon

## Requirements

- Visual Studio Code version 1.105.0 or higher

## Extension Settings

This extension stores the following settings in global state:

- **Favorites**: List of favorited directory paths
- **Show Hidden Files**: Toggle visibility of hidden files
- **View Mode**: List or grid view preference

These settings persist across VS Code sessions and are automatically saved when changed.

## Known Issues

- Very large directories (1000+ files) may take a moment to load
- Image previews for very large image files may be slow to generate
- Symbolic links are displayed as regular files/folders

## Release Notes

### 0.0.1

Initial release of File Explorer:

- Custom file browser with webview interface
- File operations (create, rename, delete)
- Image preview support
- Favorites management
- Hidden files toggle
- List and grid view modes
- Context menu integration
- Direct file opening in VS Code editor

---

## Support

For issues, questions, or feature requests, please visit the [GitHub repository](https://github.com/yourusername/file-explorer).

**Enjoy exploring your files!**
