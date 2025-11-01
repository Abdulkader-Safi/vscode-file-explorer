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
          localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, "src", "webview")),
          ],
        }
      );

      // Set the webview's HTML content
      panel.webview.html = getWebviewContent(panel.webview, context);

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case "sendNotification":
              vscode.window.showInformationMessage(message.text);
              return;

            case "getHomeDirectory":
              const homeDir = os.homedir();
              await sendDirectoryContents(panel, homeDir);
              return;

            case "openDirectory":
              await sendDirectoryContents(panel, message.path);
              return;

            case "navigateUp":
              const parentPath = path.dirname(message.currentPath);
              await sendDirectoryContents(panel, parentPath);
              return;

            case "getImagePreview":
              await sendImagePreview(panel, message.path);
              return;

            case "copyPath":
              await vscode.env.clipboard.writeText(message.path);
              vscode.window.showInformationMessage("Path copied to clipboard");
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
  dirPath: string
) {
  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });

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

        return {
          name: item.name,
          isDirectory: item.isDirectory(),
          path: itemPath,
          size: size,
          modified: modified,
          kind: getFileKind(item.name, item.isDirectory()),
          isImage: isImage,
        };
      })
    );

    panel.webview.postMessage({
      command: "updateDirectory",
      path: dirPath,
      items: fileItems,
    });
  } catch (error) {
    panel.webview.postMessage({
      command: "error",
      text: error instanceof Error ? error.message : "Failed to read directory",
    });
  }
}

async function sendImagePreview(
  panel: vscode.WebviewPanel,
  imagePath: string
) {
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

// This method is called when your extension is deactivated
export function deactivate() {}
