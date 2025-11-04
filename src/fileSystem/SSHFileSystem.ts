/**
 * SSH File System implementation
 * Uses SFTP protocol for remote file operations
 */

import * as path from "path";
import { FileSystemProvider, FileItem, FileStat } from "./FileSystemProvider";
import { SSHConnection } from "../ssh/SSHConnection";
import { FileInfo } from "ssh2-sftp-client";

export class SSHFileSystem implements FileSystemProvider {
  private connection: SSHConnection;
  private homeDir: string | null = null;

  constructor(connection: SSHConnection) {
    this.connection = connection;
  }

  getType(): "local" | "ssh" {
    return "ssh";
  }

  getConnectionId(): string | null {
    return this.connection.getId();
  }

  async readDirectory(
    dirPath: string,
    showHidden: boolean
  ): Promise<FileItem[]> {
    const sftp = this.connection.getSFTPClient();
    const items = (await sftp.list(dirPath)) as FileInfo[];

    const fileItems: FileItem[] = items
      .map((item) => {
        const itemPath = this.joinPath(dirPath, item.name);
        const isDirectory = item.type === "d";
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
          isDirectory: isDirectory,
          path: itemPath,
          size: item.size || 0,
          modified: item.modifyTime || 0,
          kind: this.getFileKind(item.name, isDirectory),
          isImage: isImage,
          isHidden: isHidden,
          permissions: this.formatPermissions(item.rights as any),
        };
      })
      .filter((item) => item.name !== "." && item.name !== "..");

    // Filter hidden files based on setting
    return showHidden
      ? fileItems
      : fileItems.filter((item) => !item.isHidden);
  }

  async readFile(filePath: string): Promise<Buffer> {
    const sftp = this.connection.getSFTPClient();
    const data = await sftp.get(filePath);

    // Ensure we always return a proper Buffer
    if (Buffer.isBuffer(data)) {
      return data;
    } else if (data instanceof Uint8Array) {
      return Buffer.from(data);
    } else if (Array.isArray(data)) {
      return Buffer.from(data);
    } else {
      return Buffer.from(String(data));
    }
  }

  async writeFile(filePath: string, content: Buffer | string): Promise<void> {
    const sftp = this.connection.getSFTPClient();
    await sftp.put(Buffer.from(content), filePath);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const sftp = this.connection.getSFTPClient();
    await sftp.rename(oldPath, newPath);
  }

  async delete(itemPath: string, isDirectory: boolean): Promise<void> {
    const sftp = this.connection.getSFTPClient();

    if (isDirectory) {
      await sftp.rmdir(itemPath, true);
    } else {
      await sftp.delete(itemPath);
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    const sftp = this.connection.getSFTPClient();
    await sftp.mkdir(dirPath, false);
  }

  async exists(itemPath: string): Promise<boolean> {
    const sftp = this.connection.getSFTPClient();
    try {
      await sftp.stat(itemPath);
      return true;
    } catch {
      return false;
    }
  }

  async stat(itemPath: string): Promise<FileStat> {
    const sftp = this.connection.getSFTPClient();
    const stats = await sftp.stat(itemPath);

    return {
      size: stats.size || 0,
      modified: stats.modifyTime || 0,
      isDirectory: stats.isDirectory,
      permissions: this.formatPermissions((stats as any).rights),
    };
  }

  async getHomeDirectory(): Promise<string> {
    if (this.homeDir) {
      return this.homeDir;
    }

    const sftp = this.connection.getSFTPClient();

    // First, try to resolve ~ which should give us the actual home directory
    try {
      const homeDir = await sftp.realPath("~");
      if (homeDir) {
        // Verify it exists and is a directory
        const stats = await sftp.stat(homeDir);
        if (stats.isDirectory) {
          this.homeDir = homeDir;
          return homeDir;
        }
      }
    } catch {
      // realPath failed, continue with fallback options
    }

    // Get username from connection config
    const username = this.connection.getConfig().username;

    // Try common home directory locations
    const possibleHomes = [
      `/home/${username}`, // User's home directory (most common for non-root)
      `/root`,             // Root user home
      `/home`,             // Home directory base
      `/`,                 // System root as last resort
    ];

    for (const homePath of possibleHomes) {
      try {
        const stats = await sftp.stat(homePath);
        if (stats.isDirectory) {
          this.homeDir = homePath;
          return homePath;
        }
      } catch {
        // This path doesn't exist or is not accessible, try next
        continue;
      }
    }

    // Ultimate fallback to root
    this.homeDir = "/";
    return "/";
  }

  getParentDirectory(currentPath: string): string {
    // Always use POSIX path handling for remote systems
    return path.posix.dirname(currentPath);
  }

  joinPath(...segments: string[]): string {
    // Always use POSIX path handling for remote systems
    return path.posix.join(...segments);
  }

  dirname(filePath: string): string {
    return path.posix.dirname(filePath);
  }

  basename(filePath: string): string {
    return path.posix.basename(filePath);
  }

  async testConnection(): Promise<boolean> {
    return await this.connection.isHealthy();
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();
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

  private formatPermissions(
    rights: { user: number; group: number; other: number } | undefined
  ): string {
    if (!rights) {
      return "----------";
    }

    const formatRights = (r: number): string => {
      const read = r & 4 ? "r" : "-";
      const write = r & 2 ? "w" : "-";
      const execute = r & 1 ? "x" : "-";
      return read + write + execute;
    };

    return (
      "d" +
      formatRights(rights.user) +
      formatRights(rights.group) +
      formatRights(rights.other)
    );
  }
}
