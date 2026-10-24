import { PluginListenerHandle, registerPlugin } from '@capacitor/core';

/**
 * Local-network peers for the travel journal (spec 1.113 §5.4), implemented in Swift in the bkg iOS
 * project (`ios/App/App/LocalPeerPlugin.swift`) with Network.framework: Bonjour service
 * `_okrjournal._tcp`, TLS with a pre-shared key derived from the journal's peer secret (only devices
 * holding the secret connect, everything is encrypted), one connection per peer pair. JSON messages and
 * photo files (native binary frames into Documents/journals/<journalKey>/) share the connection.
 */
export interface PeerInfo { peerId: string; deviceId: string; name: string }

export interface LocalPeerPlugin {
  /** `secret` = the journal's peer secret, base64 (meta `peerSecret:<journalKey>`, plan 4). */
  start(options: { deviceId: string; journalKey: string; displayName: string; secret: string }): Promise<void>;
  stop(): Promise<void>;
  send(options: { peerId: string; message: string }): Promise<void>; // message = JSON text
  /** Sends Documents/journals/<journalKey>/<file> to the peer. */
  sendFile(options: { peerId: string; file: string }): Promise<void>;
  addListener(event: 'peerConnected' | 'peerDisconnected', cb: (p: PeerInfo) => void): Promise<PluginListenerHandle>;
  addListener(event: 'message', cb: (m: { peerId: string; message: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'fileReceived', cb: (f: { peerId: string; file: string }) => void): Promise<PluginListenerHandle>;
  /** Diagnostics: one line per network step (Bonjour, dial, connection state, hello). */
  addListener(event: 'log', cb: (l: { line: string }) => void): Promise<PluginListenerHandle>;
}

export const LocalPeer = registerPlugin<LocalPeerPlugin>('LocalPeer');
