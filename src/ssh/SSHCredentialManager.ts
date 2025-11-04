/**
 * SSH Credential Manager
 * Securely manages SSH credentials using VSCode's Secret Storage API
 */

import * as vscode from "vscode";
import * as fs from "fs";

export interface StoredCredentials {
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
}

export class SSHCredentialManager {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Store credentials securely for a connection
   */
  async storeCredentials(
    connectionId: string,
    credentials: StoredCredentials
  ): Promise<void> {
    const credentialsJson = JSON.stringify(credentials);
    await this.context.secrets.store(
      `ssh-creds-${connectionId}`,
      credentialsJson
    );
  }

  /**
   * Retrieve credentials for a connection
   */
  async getCredentials(
    connectionId: string
  ): Promise<StoredCredentials | null> {
    const credentialsJson = await this.context.secrets.get(
      `ssh-creds-${connectionId}`
    );

    if (!credentialsJson) {
      return null;
    }

    try {
      return JSON.parse(credentialsJson);
    } catch {
      return null;
    }
  }

  /**
   * Delete credentials for a connection
   */
  async deleteCredentials(connectionId: string): Promise<void> {
    await this.context.secrets.delete(`ssh-creds-${connectionId}`);
  }

  /**
   * Read private key from file
   */
  async readPrivateKey(keyPath: string): Promise<Buffer> {
    try {
      return await fs.promises.readFile(keyPath);
    } catch (error) {
      throw new Error(
        `Failed to read private key from ${keyPath}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Validate private key format
   */
  isValidPrivateKey(keyContent: Buffer | string): boolean {
    const keyString =
      keyContent instanceof Buffer ? keyContent.toString() : keyContent;

    // Check for common private key headers
    const validHeaders = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "-----BEGIN DSA PRIVATE KEY-----",
      "-----BEGIN EC PRIVATE KEY-----",
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "-----BEGIN PRIVATE KEY-----",
      "-----BEGIN ENCRYPTED PRIVATE KEY-----",
    ];

    return validHeaders.some((header) => keyString.includes(header));
  }

  /**
   * Check if a private key is encrypted (requires passphrase)
   */
  isEncryptedKey(keyContent: Buffer | string): boolean {
    const keyString =
      keyContent instanceof Buffer ? keyContent.toString() : keyContent;

    return (
      keyString.includes("-----BEGIN ENCRYPTED PRIVATE KEY-----") ||
      keyString.includes("Proc-Type: 4,ENCRYPTED")
    );
  }
}
