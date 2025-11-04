# File Explorer

A modern, feature-rich file explorer for Visual Studio Code with an intuitive webview interface. Browse your file system, preview images, manage favorites, and perform common file operations without leaving your editor.

## Features

### Enhanced File Navigation

- **Custom File Explorer UI**: Beautiful, responsive interface for browsing directories
- **Quick Navigation**: Navigate up directories, jump to home directory, or browse to any path
- **Dual View Modes**: Switch between list and grid views for optimal file browsing
- **Image Previews**: Inline image previews for JPEG, PNG, GIF, SVG, and WebP files
- **File Type Recognition**: Automatic detection and display of file types with appropriate icons
- **Multi-System Support**: Seamlessly browse both local and remote (SSH/SFTP) file systems

### SSH/SFTP Remote File Management

- **SSH Connections**: Connect to remote servers via SSH/SFTP protocol
- **Multiple Authentication Methods**:
  - Password-based authentication
  - Private key authentication (with optional passphrase support)
- **Secure Credential Storage**: Credentials are stored securely using VSCode's Secret Storage API
- **Connection Management**: Save, manage, and quickly switch between multiple SSH connections
- **Remote File Editing**: Edit remote files with automatic upload on save
- **Connection Health Monitoring**: Automatic connection health checks and reconnection

### File Operations

- **Create Files & Folders**: Quickly create new files and folders from within the explorer (local and remote)
- **Rename**: Rename files and folders with a simple inline interface
- **Delete**: Safely delete files and folders with confirmation dialogs
- **Copy Path**: Copy full file paths to clipboard with a single click
- **Remote File Editing**: Edit files on remote servers with automatic sync on save

### Productivity Features

- **Profile-Based Favorites**: Bookmark frequently accessed directories for quick access
  - Separate favorites for localhost and each SSH connection
  - Favorites are automatically saved per profile
  - Switch profiles to see your favorite directories for that system
- **Profile Selector**: Quickly switch between localhost and SSH connections from a dropdown menu
- **Drag-and-Drop Reordering**: Reorder your favorites via drag-and-drop in settings
- **Hidden Files Toggle**: Show or hide hidden files (files starting with `.`)
- **Persistent Settings**: Your view preferences, favorites, and SSH connections are saved between sessions
- **Context Menu**: Right-click context menu for common file operations

### File Opening

- **Direct Integration**: Open files directly in VS Code editor with a single click
- **Non-Preview Mode**: Files open in dedicated tabs (not preview mode) for better workflow
- **Smart File Handling**: Automatic handling of text files vs. images for both local and remote systems

## Usage

### Basic File Navigation

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
   - Add directories to favorites by right-clicking folders and selecting "Add to Favorites"
   - Reorder favorites by dragging and dropping in the settings panel
   - Favorites are profile-specific (each profile has its own set of favorites)

### SSH/SFTP Remote Connections and Profile Management

1. **Add an SSH Connection**:

   - Select "+ Add New SSH..." from the Profile dropdown at the top of the sidebar
   - Enter connection details (name, host, port, username)
   - Choose authentication method (password or private key)
   - Optionally test the connection before saving
   - Click "Save & Connect" to save and connect

2. **Switch Between Profiles**:

   - Use the **Profile dropdown** at the top of the sidebar to switch between:
     - **localhost**: Your local file system
     - **SSH connections**: Any saved remote servers
   - When you switch profiles, your favorites and current directory automatically update
   - Each profile maintains its own set of favorites

3. **Connect to a Remote Server**:

   - Select an SSH connection from the Profile dropdown
   - The extension will connect and display your remote home directory
   - Browse and manage files just like on your local system

4. **Edit Remote Files**:

   - Click on any remote file to open it in the editor
   - Make your changes and save (Cmd+S / Ctrl+S)
   - Changes are automatically uploaded to the remote server
   - You'll see a confirmation message when the upload completes

5. **Manage SSH Connections**:
   - Open Settings (gear icon in toolbar)
   - Scroll to "Manage SSH Connections" section
   - View all saved connections with their details (username@host:port)
   - Delete unwanted connections using the "✕" button

## Requirements

- Visual Studio Code version 1.105.0 or higher

## Extension Settings

This extension stores the following settings:

### Global State

- **Favorites**: Profile-specific favorited directory paths (separate for localhost and each SSH connection, with drag-and-drop reordering support)
- **Show Hidden Files**: Toggle visibility of hidden files
- **View Mode**: List or grid view preference
- **SSH Connections**: Saved SSH connection configurations

### Secure Storage

- **SSH Credentials**: Passwords, private key paths, and passphrases are stored securely using VSCode's Secret Storage API

All settings persist across VS Code sessions and are automatically saved when changed.

## Known Issues

- Very large directories (1000+ files) may take a moment to load
- Image previews for very large image files may be slow to generate
- Symbolic links are displayed as regular files/folders
- SSH connection timeout is set to 30 seconds, which may be insufficient for very slow networks

## Release Notes

### 0.1.0

Major update with SSH/SFTP support and profile-based favorites:

- **SSH/SFTP Remote File System Support**: Connect to and manage files on remote servers
- **Multiple Authentication Methods**: Support for password and private key authentication
- **Secure Credential Storage**: Credentials stored securely using VSCode's Secret Storage API
- **Remote File Editing**: Edit remote files with automatic upload on save
- **Profile-Based Favorites**: Separate favorites for localhost and each SSH connection
- **Profile Selector**: Dropdown menu to quickly switch between localhost and SSH connections
- **Connection Management**: Save, manage, and delete SSH connections from settings panel
- **Connection Health Monitoring**: Automatic connection health checks every 30 seconds
- **File System Abstraction**: Unified interface for local and remote file operations
- **Buffer Handling Fix**: Proper handling of SFTP responses (Array/Uint8Array to Buffer conversion)
- **Home Directory Resolution**: Smart home directory detection for non-root users
- **Memory Leak Fix**: Increased EventEmitter max listeners to prevent warnings

### 0.0.3

- Added drag-and-drop reordering for favorites in settings panel
- Improved favorites management with visual feedback during reordering

### 0.0.2

- Fixed UI issues

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

For issues, questions, or feature requests, please visit the [GitHub repository](https://github.com/Abdulkader-Safi/vscode-file-explorer.git).

**Enjoy exploring your files!**
