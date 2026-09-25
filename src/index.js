/**
 * Browser-only ElevenLabs Conversational AI transport. UI, session fetching,
 * consent, persistence, and application context stay with the host app.
 */
export class ElevenLabsTextChatClient {
  constructor({
    sessionProvider,
    agentId,
    dynamicVariables = {},
    webSocketFactory = (url) => new WebSocket(url),
    onEvent = () => {},
    onStatusChange = () => {},
  } = {}) {
    if (typeof sessionProvider !== 'function' && !agentId) {
      throw new TypeError('Provide sessionProvider or agentId');
    }
    this.sessionProvider = sessionProvider;
    this.agentId = agentId;
    this.dynamicVariables = dynamicVariables;
    this.webSocketFactory = webSocketFactory;
    this.onEvent = onEvent;
    this.onStatusChange = onStatusChange;
    this.ws = null;
    this.session = null;
    this.connectPromise = null;
  }

  get connected() {
    return Boolean(this.ws && this.ws.readyState === 1);
  }

  async connect(session = null) {
    if (this.connected) return true;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.open(session)
      .catch((error) => {
        this.setStatus('error');
        this.onEvent({ type: 'transport_error', error });
        throw error;
      })
      .finally(() => { this.connectPromise = null; });
    return this.connectPromise;
  }

  async open(session) {
    this.setStatus('connecting');
    this.session = session || (this.sessionProvider ? await this.sessionProvider() : null);
    if (this.sessionProvider && !this.session) {
      this.setStatus('disconnected');
      return false;
    }

    const url = this.session?.signed_url || this.session?.signedUrl || this.agentUrl();
    if (!url) throw new Error('Session did not include a signed URL');

    const dynamicVariables = this.session?.dynamic_variables || this.session?.dynamicVariables || this.dynamicVariables;
    const ws = this.webSocketFactory(url);
    this.ws = ws;

    return new Promise((resolve, reject) => {
      let settled = false;
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'conversation_initiation_client_data',
          conversation_config_override: { conversation: { text_only: true } },
          dynamic_variables: dynamicVariables,
        }));
        this.setStatus('connected');
        settled = true;
        resolve(true);
      };
      ws.onmessage = (event) => this.handleMessage(event);
      ws.onerror = (event) => {
        this.setStatus('error');
        if (!settled) {
          settled = true;
          reject(event instanceof Error ? event : new Error('WebSocket connection failed'));
        }
        this.onEvent({ type: 'transport_error', error: event });
      };
      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null;
          this.session = null;
        }
        this.setStatus('disconnected');
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket closed before connecting'));
        }
      };
    });
  }

  async send(text, { context } = {}) {
    const message = String(text || '').trim();
    if (!message) return false;
    if (!(await this.connect())) return false;

    if (context) this.sendContext(context);
    this.ws.send(JSON.stringify({ type: 'user_message', text: message }));
    return true;
  }

  sendContext(text) {
    if (!this.connected) throw new Error('WebSocket is not connected');
    if (text) this.ws.send(JSON.stringify({ type: 'contextual_update', text: String(text) }));
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    this.session = null;
    if (ws && ws.readyState < 2) ws.close();
    this.setStatus('disconnected');
  }

  agentUrl() {
    return this.agentId
      ? `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${encodeURIComponent(this.agentId)}`
      : null;
  }

  handleMessage(event) {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.type === 'ping' && data.ping_event) {
      if (this.connected) this.ws.send(JSON.stringify({ type: 'pong', event_id: data.ping_event.event_id }));
      return;
    }

    if (data.type === 'agent_chat_response_part') {
      const part = data.text_response_part || {};
      if (part.type === 'start') this.onEvent({ type: 'response_start' });
      else if (part.type === 'delta' && part.text) this.onEvent({ type: 'response_delta', text: part.text });
      else if (part.type === 'stop') this.onEvent({ type: 'response_complete' });
      return;
    }

    if (data.type === 'agent_response' || data.type === 'conversation_done') {
      const text = data.agent_response_event?.agent_response
        || data.agent_response_event?.text
        || data.content
        || data.text
        || data.message;
      if (text) this.onEvent({ type: 'response', text });
      return;
    }

    if (data.type === 'error') this.onEvent({ type: 'agent_error', error: data.error || data.message || data });
  }

  setStatus(status) {
    this.onStatusChange(status);
  }
}
