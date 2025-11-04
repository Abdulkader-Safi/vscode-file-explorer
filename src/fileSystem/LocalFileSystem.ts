/**
 * Local file system implementation
 * Uses Node.js fs.promises API for local file operations
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { FileSystemProvider, FileItem, FileStat } from "./FileSystemProvider";

export class LocalFileSystem implements FileSystemProvider {
  getType(): "local" | "ssh" {
    return "local";
  }

  getConnectionId(): string | null {
    return null;
  }

  async readDirectory(
    dirPath: string,
    showHidden: boolean
  ): Promise<FileItem[]> {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });

    const fileItems = await Promise.all(
      items.map(async (item) => {
        const itemPath = path.join(dirPath, item.name);
        let size = 0;
        let modified = 0;

        try {
          const stats = await fs.promises.stat(itemPath);
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
          kind: this.getFileKind(item.name, item.isDirectory()),
          isImage: isImage,
          isHidden: isHidden,
        };
      })
    );

    // Filter hidden files based on setting
    return showHidden ? fileItems : fileItems.filter((item) => !item.isHidden);
  }

  async readFile(filePath: string): Promise<Buffer> {
    return await fs.promises.readFile(filePath);
  }

  async writeFile(filePath: string, content: Buffer | string): Promise<void> {
    await fs.promises.writeFile(filePath, content);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.promises.rename(oldPath, newPath);
  }

  async delete(itemPath: string, isDirectory: boolean): Promise<void> {
    if (isDirectory) {
      await fs.promises.rm(itemPath, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(itemPath);
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath);
  }

  async exists(itemPath: string): Promise<boolean> {
    try {
      await fs.promises.access(itemPath);
      return true;
    } catch {
      return false;
    }
  }

  async stat(itemPath: string): Promise<FileStat> {
    const stats = await fs.promises.stat(itemPath);
    return {
      size: stats.size,
      modified: stats.mtime.getTime(),
      isDirectory: stats.isDirectory(),
    };
  }

  async getHomeDirectory(): Promise<string> {
    return os.homedir();
  }

  getParentDirectory(currentPath: string): string {
    return path.dirname(currentPath);
  }

  joinPath(...segments: string[]): string {
    return path.join(...segments);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string): string {
    return path.basename(filePath);
  }

  async testConnection(): Promise<boolean> {
    // Local file system is always connected
    return true;
  }

  async disconnect(): Promise<void> {
    // Nothing to disconnect for local file system
  }

  private getFileKind(fileName: string, isDirectory: boolean): string {
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
}
