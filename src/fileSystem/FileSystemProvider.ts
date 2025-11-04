/**
 * File system abstraction interface
 * Allows the extension to work with both local and remote (SSH) file systems
 */

export interface FileItem {
  name: string;
  isDirectory: boolean;
  path: string;
  size: number;
  modified: number;
  kind: string;
  isImage: boolean;
  isHidden: boolean;
  permissions?: string; // For SSH: e.g., "drwxr-xr-x"
}

export interface FileStat {
  size: number;
  modified: number;
  isDirectory: boolean;
  permissions?: string;
}

/**
 * Abstract interface for file system operations
 * Implementations: LocalFileSystem, SSHFileSystem
 */
export interface FileSystemProvider {
  /**
   * Get the type of file system (local or ssh)
   */
  getType(): "local" | "ssh";

  /**
   * Get connection identifier (for SSH connections)
   */
  getConnectionId(): string | null;

  /**
   * Read directory contents
   * @param dirPath Directory path
   * @param showHidden Whether to include hidden files
   * @returns Array of file items
   */
  readDirectory(dirPath: string, showHidden: boolean): Promise<FileItem[]>;

  /**
   * Read file contents
   * @param filePath File path
   * @returns File contents as Buffer
   */
  readFile(filePath: string): Promise<Buffer>;

  /**
   * Write file contents
   * @param filePath File path
   * @param content File contents
   */
  writeFile(filePath: string, content: Buffer | string): Promise<void>;

  /**
   * Rename file or directory
   * @param oldPath Current path
   * @param newPath New path
   */
  rename(oldPath: string, newPath: string): Promise<void>;

  /**
   * Delete file or directory
   * @param itemPath Path to delete
   * @param isDirectory Whether the item is a directory
   */
  delete(itemPath: string, isDirectory: boolean): Promise<void>;

  /**
   * Create directory
   * @param dirPath Directory path
   */
  mkdir(dirPath: string): Promise<void>;

  /**
   * Check if path exists
   * @param itemPath Path to check
   * @returns True if exists
   */
  exists(itemPath: string): Promise<boolean>;

  /**
   * Get file/directory stats
   * @param itemPath Path to stat
   * @returns File statistics
   */
  stat(itemPath: string): Promise<FileStat>;

  /**
   * Get home directory path
   * @returns Home directory path
   */
  getHomeDirectory(): Promise<string>;

  /**
   * Get parent directory path
   * @param currentPath Current path
   * @returns Parent directory path
   */
  getParentDirectory(currentPath: string): string;

  /**
   * Join path segments
   * @param segments Path segments
   * @returns Joined path
   */
  joinPath(...segments: string[]): string;

  /**
   * Get directory name from path
   * @param filePath File path
   * @returns Directory name
   */
  dirname(filePath: string): string;

  /**
   * Get base name from path
   * @param filePath File path
   * @returns Base name
   */
  basename(filePath: string): string;

  /**
   * Test connection health (primarily for SSH)
   * @returns True if connection is healthy
   */
  testConnection(): Promise<boolean>;

  /**
   * Disconnect/cleanup (primarily for SSH)
   */
  disconnect(): Promise<void>;
}
