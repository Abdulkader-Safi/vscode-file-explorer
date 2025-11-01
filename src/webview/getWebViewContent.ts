import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export const getWebviewContent = (
  webview: vscode.Webview,
  context: vscode.ExtensionContext
): string => {
  const webviewPath = path.join(context.extensionPath, "src", "webview");

  // Get URIs for CSS and JS files
  const styleUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(webviewPath, "styles.css"))
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(webviewPath, "script.js"))
  );

  // Read the HTML file
  const htmlPath = path.join(webviewPath, "index.html");
  let html = fs.readFileSync(htmlPath, "utf8");

  // Replace placeholders with actual URIs
  html = html
    .replace(/{{styleUri}}/g, styleUri.toString())
    .replace(/{{scriptUri}}/g, scriptUri.toString())
    .replace(/{{cspSource}}/g, webview.cspSource);

  return html;
};
