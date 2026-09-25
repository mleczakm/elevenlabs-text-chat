export interface ChatSession {
  signed_url?: string;
  signedUrl?: string;
  dynamic_variables?: Record<string, string | number | boolean | null>;
  dynamicVariables?: Record<string, string | number | boolean | null>;
}

export type ChatStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type ChatEvent =
  | { type: 'response_start' }
  | { type: 'response_delta'; text: string }
  | { type: 'response_complete' }
  | { type: 'response'; text: string }
  | { type: 'agent_error'; error: unknown }
  | { type: 'transport_error'; error: unknown };

export interface ElevenLabsTextChatClientOptions {
  /** Return a backend-issued signed URL and optional dynamic variables. Return null to defer (for consent/login). */
  sessionProvider?: () => Promise<ChatSession | null>;
  /** Agent ID for agents deliberately configured for direct public browser access. */
  agentId?: string;
  dynamicVariables?: Record<string, string | number | boolean | null>;
  webSocketFactory?: (url: string) => WebSocket;
  onEvent?: (event: ChatEvent) => void;
  onStatusChange?: (status: ChatStatus) => void;
}

export class ElevenLabsTextChatClient {
  constructor(options?: ElevenLabsTextChatClientOptions);
  readonly connected: boolean;
  connect(session?: ChatSession | null): Promise<boolean>;
  send(text: string, options?: { context?: string }): Promise<boolean>;
  sendContext(text: string): void;
  close(): void;
}
