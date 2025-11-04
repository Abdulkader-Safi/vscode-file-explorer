// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { getWebviewContent } from "./webview/getWebViewContent";
import { FileSystemProvider } from "./fileSystem/FileSystemProvider";
import { LocalFileSystem } from "./fileSystem/LocalFileSystem";
import { SSHFileSystem } from "./fileSystem/SSHFileSystem";
import { SSHConnectionManager } from "./ssh/SSHConnectionManager";

// Global state
let activeFileSystem: FileSystemProvider;
let sshConnectionManager: SSHConnectionManager;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Initialize with local file system
  activeFileSystem = new LocalFileSystem();

  // Initialize SSH connection manager
  sshConnectionManager = new SSHConnectionManager(context);

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "file-explorer.helloWorld",
    () => {
      // Create and show the webview panel
      const panel = vscode.window.createWebviewPanel(
        "fileExplorerView",
        "File Explorer",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.file(
              path.join(context.extensionPath, "dist", "webview")
            ),
          ],
        }
      );

      // Set the webview's HTML content
      panel.webview.html = getWebviewContent(panel.webview, context);

      // Send initial state to webview
      // Load profile-specific favorites
      const allFavorites = context.globalState.get<{
        [profileId: string]: Array<{ path: string; name: string }>;
      }>("allFavorites", { localhost: [] });

      // Migrate old favorites to new structure if needed
      const oldFavorites =
        context.globalState.get<Array<{ path: string; name: string }>>(
          "favorites"
        );
      if (oldFavorites && oldFavorites.length > 0 && !allFavorites.localhost) {
        allFavorites.localhost = oldFavorites;
        context.globalState.update("allFavorites", allFavorites);
        context.globalState.update("favorites", undefined); // Remove old key
      }

      const showHiddenFiles = context.globalState.get<boolean>(
        "showHiddenFiles",
        false
      );
      const viewMode = context.globalState.get<"list" | "grid">(
        "viewMode",
        "list"
      );
      const savedConnections = sshConnectionManager.getSavedConnections();

      panel.webview.postMessage({
        command: "initState",
        allFavorites,
        showHiddenFiles,
        viewMode,
        fileSystemType: activeFileSystem.getType(),
        connectionId: activeFileSystem.getConnectionId(),
        sshConnections: savedConnections,
      });

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case "sendNotification":
              vscode.window.showInformationMessage(message.text);
              return;

            case "getHomeDirectory":
              const homeDir = await activeFileSystem.getHomeDirectory();
              await sendDirectoryContents(panel, homeDir, context);
              return;

            case "openDirectory":
              await sendDirectoryContents(panel, message.path, context);
              return;

            case "navigateUp":
              const parentPath = activeFileSystem.getParentDirectory(
                message.currentPath
              );
              await sendDirectoryContents(panel, parentPath, context);
              return;

            case "getImagePreview":
              await sendImagePreview(panel, message.path);
              return;

            case "copyPath":
              await vscode.env.clipboard.writeText(message.path);
              vscode.window.showInformationMessage("Path copied to clipboard");
              return;

            case "saveFavorites":
              // Save profile-specific favorites
              await context.globalState.update(
                "allFavorites",
                message.allFavorites
              );
              return;

            case "saveSettings":
              if (message.showHiddenFiles !== undefined) {
                await context.globalState.update(
                  "showHiddenFiles",
                  message.showHiddenFiles
                );
              }
              if (message.viewMode !== undefined) {
                await context.globalState.update("viewMode", message.viewMode);
              }
              return;

            case "openFile":
              await handleOpenFile(message.path, context);
              return;

            case "renameItem":
              await handleRename(panel, message.path, message.newName, context);
              return;

            case "deleteItem":
              await handleDelete(
                panel,
                message.path,
                message.isDirectory,
                context
              );
              return;

            case "createFile":
              await handleCreateFile(
                panel,
                message.dirPath,
                message.fileName,
                context
              );
              return;

            case "createFolder":
              await handleCreateFolder(
                panel,
                message.dirPath,
                message.folderName,
                context
              );
              return;

            // SSH Connection Management
            case "testSSHConnection":
              await handleTestSSHConnection(panel, message);
              return;

            case "createSSHConnection":
              await handleCreateSSHConnection(panel, message, context);
              return;

            case "connectSSH":
              await handleConnectSSH(panel, message, context);
              return;

            case "disconnectSSH":
              await handleDisconnectSSH(panel, message);
              return;

            case "switchToLocal":
              // Switch back to local filesystem
              activeFileSystem = new LocalFileSystem();
              const localHomeDir = await activeFileSystem.getHomeDirectory();
              await sendDirectoryContents(panel, localHomeDir, context);
              panel.webview.postMessage({
                command: "fileSystemSwitched",
                type: "local",
                connectionId: null,
              });
              return;

            case "deleteSSHConnection":
              await handleDeleteSSHConnection(panel, message);
              return;

            case "switchFileSystem":
              await handleSwitchFileSystem(panel, message, context);
              return;
          }
        },
        undefined,
        context.subscriptions
      );
    }
  );

  context.subscriptions.push(disposable);
}

async function sendDirectoryContents(
  panel: vscode.WebviewPanel,
  dirPath: string,
  context: vscode.ExtensionContext
) {
  try {
    const showHiddenFiles = context.globalState.get<boolean>(
      "showHiddenFiles",
      false
    );

    // Use the active file system provider
    const items = await activeFileSystem.readDirectory(
      dirPath,
      showHiddenFiles
    );

    // Check if panel is still active before posting message
    if (!panel || panel.webview === undefined) {
      return;
    }

    panel.webview.postMessage({
      command: "updateDirectory",
      path: dirPath,
      items: items,
      fileSystemType: activeFileSystem.getType(),
      connectionId: activeFileSystem.getConnectionId(),
    });
  } catch (error) {
    // Check if panel is still active before posting error
    if (panel && panel.webview !== undefined) {
      panel.webview.postMessage({
        command: "error",
        text:
          error instanceof Error ? error.message : "Failed to read directory",
      });
    }
  }
}

async function sendImagePreview(panel: vscode.WebviewPanel, imagePath: string) {
  try {
    // Check if panel is still active before proceeding
    if (!panel || panel.webview === undefined) {
      return;
    }

    const imageBuffer = await activeFileSystem.readFile(imagePath);
    const base64Image = imageBuffer.toString("base64");
    const ext = path.extname(imagePath).toLowerCase().slice(1);
    const mimeType =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
        ? "image/png"
        : ext === "gif"
        ? "image/gif"
        : ext === "svg"
        ? "image/svg+xml"
        : ext === "webp"
        ? "image/webp"
        : "image/png";

    // Check again before posting message
    if (!panel || panel.webview === undefined) {
      return;
    }

    panel.webview.postMessage({
      command: "imagePreview",
      path: imagePath,
      dataUrl: `data:${mimeType};base64,${base64Image}`,
    });
  } catch (error) {
    // Silently fail for images that can't be loaded or if webview is disposed
    console.error("Failed to load image preview:", error);
  }
}

function getFileKind(fileName: string, isDirectory: boolean): string {
  if (isDirectory) {
    return "Folder";
  }

  const ext = path.extname(fileName).toLowerCase().slice(1);
  const kindMap: { [key: string]: string } = {
    jpg: "JPEG Image",
    jpeg: "JPEG Image",
    png: "PNG Image",
    gif: "GIF Image",
    svg: "SVG Image",
    webp: "WebP Image",
    mp4: "MP4 Video",
    mov: "QuickTime Movie",
    avi: "AVI Video",
    mp3: "MP3 Audio",
    wav: "WAV Audio",
    m4a: "M4A Audio",
    pdf: "PDF Document",
    doc: "Word Document",
    docx: "Word Document",
    txt: "Text Document",
    md: "Markdown Document",
    js: "JavaScript File",
    ts: "TypeScript File",
    py: "Python File",
    java: "Java File",
    cpp: "C++ File",
    html: "HTML Document",
    css: "CSS Stylesheet",
    json: "JSON File",
    zip: "ZIP Archive",
    rar: "RAR Archive",
    tar: "TAR Archive",
    gz: "GZIP Archive",
  };

  return kindMap[ext] || ext.toUpperCase() + " File";
}

async function handleOpenFile(
  filePath: string,
  context: vscode.ExtensionContext
) {
  try {
    if (activeFileSystem.getType() === "local") {
      // For local files, open directly
      const fileUri = vscode.Uri.file(filePath);
      await vscode.commands.executeCommand("vscode.open", fileUri, {
        preview: false,
        viewColumn: vscode.ViewColumn.Active,
      });
    } else {
      // For remote (SSH) files, download to temp and open
      const fileName = activeFileSystem.basename(filePath);
      const fileExt = path.extname(fileName).toLowerCase();
      const tempDir = path.join(os.tmpdir(), "vscode-file-explorer-ssh");

      // Create temp directory if it doesn't exist
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Create a unique temp file path
      const connectionId = activeFileSystem.getConnectionId() || "default";
      const tempFilePath = path.join(tempDir, `${connectionId}-${fileName}`);

      // Download the file
      const content = await activeFileSystem.readFile(filePath);
      fs.writeFileSync(tempFilePath, content);

      // Check if it's an image file
      const imageExtensions = [
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".svg",
        ".webp",
        ".bmp",
        ".ico",
      ];
      const isImage = imageExtensions.includes(fileExt);

      // Open the file
      const fileUri = vscode.Uri.file(tempFilePath);

      if (isImage) {
        // For images, use vscode.open command which works for binary files
        await vscode.commands.executeCommand("vscode.open", fileUri, {
          preview: false,
          viewColumn: vscode.ViewColumn.Active,
        });
      } else {
        // For text files, use openTextDocument
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc, {
          preview: false,
          viewColumn: vscode.ViewColumn.Active,
        });
      }

      // Watch for changes and upload back to SSH (only for editable files, not images)
      if (!isImage) {
        const watcher = vscode.workspace.onDidSaveTextDocument(
          async (savedDoc) => {
            if (savedDoc.uri.fsPath === tempFilePath) {
              try {
                const updatedContent = fs.readFileSync(tempFilePath);
                await activeFileSystem.writeFile(filePath, updatedContent);
                vscode.window.showInformationMessage(
                  `✓ Uploaded changes to ${fileName}`
                );
              } catch (error) {
                vscode.window.showErrorMessage(
                  `Failed to upload changes: ${
                    error instanceof Error ? error.message : "Unknown error"
                  }`
                );
              }
            }
          }
        );

        // Clean up watcher when document is closed
        const closeWatcher = vscode.workspace.onDidCloseTextDocument(
          (closedDoc) => {
            if (closedDoc.uri.fsPath === tempFilePath) {
              watcher.dispose();
              closeWatcher.dispose();
              // Delete temp file
              try {
                fs.unlinkSync(tempFilePath);
              } catch {
                // Ignore errors when deleting temp file
              }
            }
          }
        );

        // Store watchers in context subscriptions so they get cleaned up
        context.subscriptions.push(watcher, closeWatcher);
      } else {
        // For images, just set up a cleanup when the editor tab is closed
        // We'll use a timeout-based cleanup since we can't easily detect when image preview is closed
        const cleanup = () => {
          setTimeout(() => {
            try {
              if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
              }
            } catch {
              // Ignore errors
            }
          }, 60000); // Clean up after 1 minute
        };
        cleanup();
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Cannot open file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function handleRename(
  panel: vscode.WebviewPanel,
  oldPath: string,
  newName: string,
  context: vscode.ExtensionContext
) {
  try {
    const dirPath = activeFileSystem.dirname(oldPath);
    const newPath = activeFileSystem.joinPath(dirPath, newName);

    await activeFileSystem.rename(oldPath, newPath);
    vscode.window.showInformationMessage(`Renamed to ${newName}`);

    // Refresh directory
    await sendDirectoryContents(panel, dirPath, context);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to rename: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function handleDelete(
  panel: vscode.WebviewPanel,
  itemPath: string,
  isDirectory: boolean,
  context: vscode.ExtensionContext
) {
  try {
    const itemName = activeFileSystem.basename(itemPath);
    const result = await vscode.window.showWarningMessage(
      `Are you sure you want to delete "${itemName}"?`,
      { modal: true },
      "Delete"
    );

    if (result === "Delete") {
      await activeFileSystem.delete(itemPath, isDirectory);

      vscode.window.showInformationMessage(`Deleted ${itemName}`);

      // Refresh directory
      const dirPath = activeFileSystem.dirname(itemPath);
      await sendDirectoryContents(panel, dirPath, context);
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to delete: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function handleCreateFile(
  panel: vscode.WebviewPanel,
  dirPath: string,
  fileName: string,
  context: vscode.ExtensionContext
) {
  try {
    const filePath = activeFileSystem.joinPath(dirPath, fileName);

    // Check if file already exists
    const exists = await activeFileSystem.exists(filePath);
    if (exists) {
      vscode.window.showErrorMessage(`File "${fileName}" already exists`);
      return;
    }

    await activeFileSystem.writeFile(filePath, "");
    vscode.window.showInformationMessage(`Created file ${fileName}`);

    // Refresh directory
    await sendDirectoryContents(panel, dirPath, context);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function handleCreateFolder(
  panel: vscode.WebviewPanel,
  dirPath: string,
  folderName: string,
  context: vscode.ExtensionContext
) {
  try {
    const folderPath = activeFileSystem.joinPath(dirPath, folderName);

    // Check if folder already exists
    const exists = await activeFileSystem.exists(folderPath);
    if (exists) {
      vscode.window.showErrorMessage(`Folder "${folderName}" already exists`);
      return;
    }

    await activeFileSystem.mkdir(folderPath);
    vscode.window.showInformationMessage(`Created folder ${folderName}`);

    // Refresh directory
    await sendDirectoryContents(panel, dirPath, context);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create folder: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// SSH Connection Handlers

async function handleTestSSHConnection(
  panel: vscode.WebviewPanel,
  message: any
) {
  try {
    const {
      host,
      port,
      username,
      authMethod,
      password,
      privateKeyPath,
      passphrase,
    } = message;

    let privateKey: Buffer | undefined;
    if (authMethod === "key" && privateKeyPath) {
      privateKey = await sshConnectionManager
        .getCredentialManager()
        .readPrivateKey(privateKeyPath);
    }

    const result = await sshConnectionManager.testConnection(
      host,
      port,
      username,
      authMethod,
      {
        password,
        privateKey,
        passphrase,
      }
    );

    panel.webview.postMessage({
      command: "sshTestResult",
      success: result.success,
      error: result.error,
    });
  } catch (error) {
    panel.webview.postMessage({
      command: "sshTestResult",
      success: false,
      error: error instanceof Error ? error.message : "Test failed",
    });
  }
}

async function handleCreateSSHConnection(
  panel: vscode.WebviewPanel,
  message: any,
  context: vscode.ExtensionContext
) {
  try {
    const {
      name,
      host,
      port,
      username,
      authMethod,
      password,
      privateKeyPath,
      passphrase,
      saveCredentials,
    } = message;

    let privateKey: Buffer | undefined;
    if (authMethod === "key" && privateKeyPath) {
      privateKey = await sshConnectionManager
        .getCredentialManager()
        .readPrivateKey(privateKeyPath);
    }

    const connectionId = await sshConnectionManager.createConnection(
      name,
      host,
      port,
      username,
      authMethod,
      {
        password,
        privateKeyPath,
        privateKey,
        passphrase,
      },
      saveCredentials
    );

    const savedConnections = sshConnectionManager.getSavedConnections();

    panel.webview.postMessage({
      command: "sshConnectionCreated",
      connectionId,
      connections: savedConnections,
    });

    vscode.window.showInformationMessage(
      `SSH connection "${name}" saved successfully`
    );
  } catch (error) {
    panel.webview.postMessage({
      command: "error",
      text:
        error instanceof Error ? error.message : "Failed to create connection",
    });
  }
}

async function handleConnectSSH(
  panel: vscode.WebviewPanel,
  message: any,
  context: vscode.ExtensionContext
) {
  try {
    const { connectionId } = message;

    panel.webview.postMessage({
      command: "sshConnectionStatus",
      connectionId,
      status: "connecting",
    });

    const connection = await sshConnectionManager.connect(connectionId);
    const sshFileSystem = new SSHFileSystem(connection);

    // Switch to SSH file system
    activeFileSystem = sshFileSystem;

    panel.webview.postMessage({
      command: "sshConnectionStatus",
      connectionId,
      status: "connected",
    });

    // Navigate to home directory
    const homeDir = await activeFileSystem.getHomeDirectory();
    await sendDirectoryContents(panel, homeDir, context);

    vscode.window.showInformationMessage(
      `Connected to ${connection.getName()}`
    );
  } catch (error) {
    panel.webview.postMessage({
      command: "sshConnectionStatus",
      connectionId: message.connectionId,
      status: "error",
      error: error instanceof Error ? error.message : "Connection failed",
    });

    vscode.window.showErrorMessage(
      `Failed to connect: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function handleDisconnectSSH(panel: vscode.WebviewPanel, message: any) {
  try {
    const { connectionId } = message;

    await sshConnectionManager.disconnect(connectionId);

    // Switch back to local file system
    activeFileSystem = new LocalFileSystem();

    panel.webview.postMessage({
      command: "sshConnectionStatus",
      connectionId,
      status: "disconnected",
    });

    vscode.window.showInformationMessage("Disconnected from SSH server");
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to disconnect: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function handleDeleteSSHConnection(
  panel: vscode.WebviewPanel,
  message: any
) {
  try {
    const { connectionId } = message;

    const connections = sshConnectionManager.getSavedConnections();
    const connection = connections.find((c) => c.id === connectionId);

    if (!connection) {
      throw new Error("Connection not found");
    }

    const result = await vscode.window.showWarningMessage(
      `Are you sure you want to delete the SSH connection "${connection.name}"?`,
      { modal: true },
      "Delete"
    );

    if (result === "Delete") {
      await sshConnectionManager.deleteConnection(connectionId);

      const updatedConnections = sshConnectionManager.getSavedConnections();

      panel.webview.postMessage({
        command: "sshConnectionDeleted",
        connectionId,
        connections: updatedConnections,
      });

      vscode.window.showInformationMessage(
        `Deleted connection "${connection.name}"`
      );
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to delete connection: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function handleSwitchFileSystem(
  panel: vscode.WebviewPanel,
  message: any,
  context: vscode.ExtensionContext
) {
  try {
    const { type, connectionId } = message;

    if (type === "local") {
      // Disconnect from SSH if connected
      if (activeFileSystem.getType() === "ssh") {
        const currentConnectionId = activeFileSystem.getConnectionId();
        if (currentConnectionId) {
          await sshConnectionManager.disconnect(currentConnectionId);
        }
      }

      // Switch to local file system
      activeFileSystem = new LocalFileSystem();

      // Navigate to home directory
      const homeDir = await activeFileSystem.getHomeDirectory();
      await sendDirectoryContents(panel, homeDir, context);

      panel.webview.postMessage({
        command: "fileSystemSwitched",
        type: "local",
        connectionId: null,
      });
    } else if (type === "ssh" && connectionId) {
      // Connect to SSH
      await handleConnectSSH(panel, { connectionId }, context);

      panel.webview.postMessage({
        command: "fileSystemSwitched",
        type: "ssh",
        connectionId,
      });
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to switch file system: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// This method is called when your extension is deactivated
export function deactivate() {
  // Disconnect all SSH connections
  if (sshConnectionManager) {
    sshConnectionManager.disconnectAll().catch(() => {
      // Ignore errors during cleanup
    });
  }
}
