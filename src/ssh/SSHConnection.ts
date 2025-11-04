/**
 * SSH Connection class
 * Manages individual SSH/SFTP connections to remote servers
 */

import SFTPClient from "ssh2-sftp-client";

export interface SSHConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: "password" | "key";
  password?: string;
  privateKey?: Buffer | string;
  passphrase?: string;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export class SSHConnection {
  private config: SSHConnectionConfig;
  private sftpClient: SFTPClient | null = null;
  private status: ConnectionStatus = "disconnected";
  private lastError: string | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor(config: SSHConnectionConfig) {
    this.config = config;
  }

  /**
   * Get connection ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Get connection name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Get connection config
   */
  getConfig(): SSHConnectionConfig {
    return { ...this.config };
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get last error message
   */
  getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Get SFTP client
   */
  getSFTPClient(): SFTPClient {
    if (!this.sftpClient || this.status !== "connected") {
      throw new Error("SFTP client not connected");
    }
    return this.sftpClient;
  }

  /**
   * Connect to SSH server
   */
  async connect(): Promise<void> {
    if (this.status === "connected" && this.sftpClient) {
      return;
    }

    this.status = "connecting";
    this.lastError = null;

    try {
      // Prepare connection config for SFTP client
      const connectConfig: any = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        readyTimeout: 30000,
        retries: 2,
        retry_factor: 2,
        retry_minTimeout: 2000,
      };

      // Add authentication
      if (this.config.authMethod === "password" && this.config.password) {
        connectConfig.password = this.config.password;
      } else if (this.config.authMethod === "key" && this.config.privateKey) {
        connectConfig.privateKey = this.config.privateKey;
        if (this.config.passphrase) {
          connectConfig.passphrase = this.config.passphrase;
        }
      } else {
        throw new Error("Invalid authentication configuration");
      }

      // Create and connect SFTP client (it handles SSH connection internally)
      this.sftpClient = new SFTPClient();
      await this.sftpClient.connect(connectConfig);

      // Increase max listeners to prevent memory leak warnings
      // Access the internal client (ssh2 Client instance) and increase its max listeners
      const internalClient = (this.sftpClient as any).client;
      if (internalClient && typeof internalClient.setMaxListeners === 'function') {
        internalClient.setMaxListeners(50);
      }

      this.status = "connected";

      // Setup connection health monitoring
      this.setupHealthMonitoring();
    } catch (error) {
      this.status = "error";
      this.lastError =
        error instanceof Error ? error.message : "Connection failed";

      // Clean up on error
      if (this.sftpClient) {
        try {
          await this.sftpClient.end();
        } catch {}
        this.sftpClient = null;
      }

      throw new Error(
        `Failed to connect to ${this.config.host}: ${this.lastError}`
      );
    }
  }

  /**
   * Test connection without fully connecting
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.connect();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Connection test failed",
      };
    }
  }

  /**
   * Check if connection is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (this.status !== "connected" || !this.sftpClient) {
      return false;
    }

    try {
      // Try a simple SFTP operation to verify connection
      await this.sftpClient.realPath(".");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reconnect to SSH server
   */
  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  /**
   * Disconnect from SSH server
   */
  async disconnect(): Promise<void> {
    // Clear health monitoring
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    // Close SFTP client
    if (this.sftpClient) {
      try {
        await this.sftpClient.end();
      } catch (error) {
        // Ignore errors during disconnect
      }
      this.sftpClient = null;
    }

    this.status = "disconnected";
    this.lastError = null;
  }

  /**
   * Setup connection health monitoring
   */
  private setupHealthMonitoring(): void {
    // Check connection health every 30 seconds
    this.keepAliveInterval = setInterval(async () => {
      const healthy = await this.isHealthy();
      if (!healthy && this.status === "connected") {
        this.status = "error";
        this.lastError = "Connection lost";
      }
    }, 30000);
  }
}
