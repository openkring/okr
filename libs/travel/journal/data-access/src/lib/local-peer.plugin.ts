import { PluginListenerHandle, registerPlugin } from '@capacitor/core';

/**
 * Local-network peers for the travel journal (spec 1.113 §5.4), implemented in Swift in the bkg iOS
 * project (`ios/App/App/LocalPeerPlugin.swift`) with Network.framework: Bonjour service
 * `_okrjournal._tcp`, one TCP connection per peer pair, messages framed as a 4-byte big-endian
 * length followed by UTF-8 JSON.
 */
export interface PeerInfo { peerId: string; deviceId: string; name: string }

export interface LocalPeerPlugin {
  start(options: { deviceId: string; journalKey: string; displayName: string }): Promise<void>;
  stop(): Promise<void>;
  send(options: { peerId: string; message: string }): Promise<void>; // message = JSON text
  addListener(event: 'peerConnected' | 'peerDisconnected', cb: (p: PeerInfo) => void): Promise<PluginListenerHandle>;
  addListener(event: 'message', cb: (m: { peerId: string; message: string }) => void): Promise<PluginListenerHandle>;
}

export const LocalPeer = registerPlugin<LocalPeerPlugin>('LocalPeer');
