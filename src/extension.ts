// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { getWebviewContent } from "./webview/getWebViewContent";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "file-explorer" is now active!');

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
            vscode.Uri.file(path.join(context.extensionPath, "src", "webview")),
          ],
        }
      );

      // Set the webview's HTML content
      panel.webview.html = getWebviewContent(panel.webview, context);

      // Send initial state to webview
      const favorites = context.globalState.get<
        Array<{ path: string; name: string }>
      >("favorites", []);
      const showHiddenFiles = context.globalState.get<boolean>(
        "showHiddenFiles",
        false
      );
      const viewMode = context.globalState.get<"list" | "grid">(
        "viewMode",
        "list"
      );

      panel.webview.postMessage({
        command: "initState",
        favorites,
        showHiddenFiles,
        viewMode,
      });

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case "sendNotification":
              vscode.window.showInformationMessage(message.text);
              return;

            case "getHomeDirectory":
              const homeDir = os.homedir();
              await sendDirectoryContents(panel, homeDir, context);
              return;

            case "openDirectory":
              await sendDirectoryContents(panel, message.path, context);
              return;

            case "navigateUp":
              const parentPath = path.dirname(message.currentPath);
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
              await context.globalState.update("favorites", message.favorites);
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
              try {
                const fileUri = vscode.Uri.file(message.path);
                await vscode.commands.executeCommand(
                  "vscode.open",
                  fileUri,
                  { preview: false, viewColumn: vscode.ViewColumn.Active }
                );
              } catch (error) {
                vscode.window.showErrorMessage(
                  `Cannot open file: ${
                    error instanceof Error ? error.message : "Unknown error"
                  }`
                );
              }
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
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const showHiddenFiles = context.globalState.get<boolean>(
      "showHiddenFiles",
      false
    );

    const fileItems = await Promise.all(
      items.map(async (item) => {
        const itemPath = path.join(dirPath, item.name);
        let stats;
        let size = 0;
        let modified = 0;

        try {
          stats = await fs.promises.stat(itemPath);
          size = stats.size;
          modified = stats.mtime.getTime();
        } catch (error) {
          // Skip files we can't stat
        }

        const ext = path.extname(item.name).toLowerCase();
        const isImage = [
          ".jpg",
          ".jpeg",
          ".png",
          ".gif",
          ".svg",
          ".webp",
        ].includes(ext);

        const isHidden = item.name.startsWith(".");

        return {
          name: item.name,
          isDirectory: item.isDirectory(),
          path: itemPath,
          size: size,
          modified: modified,
          kind: getFileKind(item.name, item.isDirectory()),
          isImage: isImage,
          isHidden: isHidden,
        };
      })
    );

    // Filter hidden files based on setting
    const filteredItems = showHiddenFiles
      ? fileItems
      : fileItems.filter((item) => !item.isHidden);

    panel.webview.postMessage({
      command: "updateDirectory",
      path: dirPath,
      items: filteredItems,
    });
  } catch (error) {
    panel.webview.postMessage({
      command: "error",
      text: error instanceof Error ? error.message : "Failed to read directory",
    });
  }
}

async function sendImagePreview(panel: vscode.WebviewPanel, imagePath: string) {
  try {
    const imageBuffer = await fs.promises.readFile(imagePath);
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

    panel.webview.postMessage({
      command: "imagePreview",
      path: imagePath,
      dataUrl: `data:${mimeType};base64,${base64Image}`,
    });
  } catch (error) {
    // Silently fail for images that can't be loaded
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

async function handleRename(
  panel: vscode.WebviewPanel,
  oldPath: string,
  newName: string,
  context: vscode.ExtensionContext
) {
  try {
    const dirPath = path.dirname(oldPath);
    const newPath = path.join(dirPath, newName);

    await fs.promises.rename(oldPath, newPath);
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
    const itemName = path.basename(itemPath);
    const result = await vscode.window.showWarningMessage(
      `Are you sure you want to delete "${itemName}"?`,
      { modal: true },
      "Delete"
    );

    if (result === "Delete") {
      if (isDirectory) {
        await fs.promises.rm(itemPath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(itemPath);
      }

      vscode.window.showInformationMessage(`Deleted ${itemName}`);

      // Refresh directory
      const dirPath = path.dirname(itemPath);
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
    const filePath = path.join(dirPath, fileName);

    // Check if file already exists
    try {
      await fs.promises.access(filePath);
      vscode.window.showErrorMessage(`File "${fileName}" already exists`);
      return;
    } catch {
      // File doesn't exist, continue
    }

    await fs.promises.writeFile(filePath, "");
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
    const folderPath = path.join(dirPath, folderName);

    // Check if folder already exists
    try {
      await fs.promises.access(folderPath);
      vscode.window.showErrorMessage(`Folder "${folderName}" already exists`);
      return;
    } catch {
      // Folder doesn't exist, continue
    }

    await fs.promises.mkdir(folderPath);
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

// This method is called when your extension is deactivated
export function deactivate() {}
