/**
 * SSH Connection Manager
 * Manages multiple SSH connections and their lifecycle
 */

import * as vscode from "vscode";
import { SSHConnection, SSHConnectionConfig } from "./SSHConnection";
import { SSHCredentialManager } from "./SSHCredentialManager";
import { randomUUID } from "crypto";

export interface SavedConnectionInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: "password" | "key";
  saveCredentials: boolean;
  privateKeyPath?: string;
}

export class SSHConnectionManager {
  private connections: Map<string, SSHConnection> = new Map();
  private credentialManager: SSHCredentialManager;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.credentialManager = new SSHCredentialManager(context);
  }

  /**
   * Get all saved connection info from storage
   */
  getSavedConnections(): SavedConnectionInfo[] {
    return this.context.globalState.get<SavedConnectionInfo[]>(
      "sshConnections",
      []
    );
  }

  /**
   * Save connection info to storage
   */
  private async saveSavedConnections(
    connections: SavedConnectionInfo[]
  ): Promise<void> {
    await this.context.globalState.update("sshConnections", connections);
  }

  /**
   * Create and save a new connection
   */
  async createConnection(
    name: string,
    host: string,
    port: number,
    username: string,
    authMethod: "password" | "key",
    credentials: {
      password?: string;
      privateKeyPath?: string;
      privateKey?: Buffer | string;
      passphrase?: string;
    },
    saveCredentials: boolean
  ): Promise<string> {
    const id = randomUUID();

    // Save connection info
    const savedConnections = this.getSavedConnections();
    savedConnections.push({
      id,
      name,
      host,
      port,
      username,
      authMethod,
      saveCredentials,
      privateKeyPath: credentials.privateKeyPath,
    });
    await this.saveSavedConnections(savedConnections);

    // Save credentials if requested
    if (saveCredentials) {
      await this.credentialManager.storeCredentials(id, {
        password: credentials.password,
        privateKeyPath: credentials.privateKeyPath,
        passphrase: credentials.passphrase,
      });
    }

    // Create connection config
    const config: SSHConnectionConfig = {
      id,
      name,
      host,
      port,
      username,
      authMethod,
      password: credentials.password,
      privateKey: credentials.privateKey,
      passphrase: credentials.passphrase,
    };

    // Create and store connection
    const connection = new SSHConnection(config);
    this.connections.set(id, connection);

    return id;
  }

  /**
   * Connect to a saved connection
   */
  async connect(connectionId: string): Promise<SSHConnection> {
    // Check if already connected
    let connection = this.connections.get(connectionId);
    if (connection && connection.getStatus() === "connected") {
      return connection;
    }

    // Get saved connection info
    const savedConnections = this.getSavedConnections();
    const savedInfo = savedConnections.find((c) => c.id === connectionId);

    if (!savedInfo) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    // Read private key if using key auth
    let privateKey: Buffer | string | undefined;
    let password: string | undefined;
    let passphrase: string | undefined;

    if (savedInfo.authMethod === "key") {
      // Get credentials for key-based auth
      const credentials = await this.credentialManager.getCredentials(
        connectionId
      );
      if (!credentials) {
        throw new Error(
          `Credentials not found for connection ${savedInfo.name}. Please reconnect with credentials.`
        );
      }
      if (credentials.privateKeyPath) {
        privateKey = await this.credentialManager.readPrivateKey(
          credentials.privateKeyPath
        );
      }
      passphrase = credentials.passphrase;
    } else {
      // Password auth - credentials are required
      const credentials = await this.credentialManager.getCredentials(
        connectionId
      );
      if (!credentials || !credentials.password) {
        throw new Error(
          `Password not found for connection ${savedInfo.name}. Please reconnect with credentials.`
        );
      }
      password = credentials.password;
    }

    // Create connection config
    const config: SSHConnectionConfig = {
      id: savedInfo.id,
      name: savedInfo.name,
      host: savedInfo.host,
      port: savedInfo.port,
      username: savedInfo.username,
      authMethod: savedInfo.authMethod,
      password: password,
      privateKey: privateKey,
      passphrase: passphrase,
    };

    // Create or update connection
    if (!connection) {
      connection = new SSHConnection(config);
      this.connections.set(connectionId, connection);
    }

    // Connect
    await connection.connect();

    return connection;
  }

  /**
   * Test connection without saving
   */
  async testConnection(
    host: string,
    port: number,
    username: string,
    authMethod: "password" | "key",
    credentials: {
      password?: string;
      privateKey?: Buffer | string;
      passphrase?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const tempId = `temp-${Date.now()}`;
    const config: SSHConnectionConfig = {
      id: tempId,
      name: "Test Connection",
      host,
      port,
      username,
      authMethod,
      ...credentials,
    };

    const connection = new SSHConnection(config);

    try {
      const result = await connection.testConnection();
      await connection.disconnect();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Test failed",
      };
    }
  }

  /**
   * Get a connection by ID
   */
  getConnection(connectionId: string): SSHConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): SSHConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Disconnect a connection
   */
  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection) {
      await connection.disconnect();
      this.connections.delete(connectionId);
    }
  }

  /**
   * Disconnect all connections
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.values()).map((c) =>
      c.disconnect()
    );
    await Promise.all(disconnectPromises);
    this.connections.clear();
  }

  /**
   * Delete a saved connection
   */
  async deleteConnection(connectionId: string): Promise<void> {
    // Disconnect if connected
    await this.disconnect(connectionId);

    // Remove from saved connections
    const savedConnections = this.getSavedConnections();
    const filtered = savedConnections.filter((c) => c.id !== connectionId);
    await this.saveSavedConnections(filtered);

    // Delete credentials
    await this.credentialManager.deleteCredentials(connectionId);
  }

  /**
   * Update connection name
   */
  async updateConnectionName(
    connectionId: string,
    newName: string
  ): Promise<void> {
    const savedConnections = this.getSavedConnections();
    const connection = savedConnections.find((c) => c.id === connectionId);

    if (connection) {
      connection.name = newName;
      await this.saveSavedConnections(savedConnections);
    }
  }

  /**
   * Get credential manager
   */
  getCredentialManager(): SSHCredentialManager {
    return this.credentialManager;
  }
}
