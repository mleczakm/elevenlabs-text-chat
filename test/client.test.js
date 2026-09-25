import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ElevenLabsTextChatClient } from '../dist/index.js';

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  send(data) {
    this.sent.push(data);
  }

  receive(data) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

function client(options = {}) {
  FakeWebSocket.instances = [];
  const events = [];
  const statuses = [];
  const instance = new ElevenLabsTextChatClient({
    webSocketFactory: (url) => new FakeWebSocket(url),
    onEvent: (event) => events.push(event),
    onStatusChange: (status) => statuses.push(status),
    ...options,
  });
  return { instance, events, statuses };
}

test('public agent sends initialization, contextual update, and user message', async () => {
  const { instance } = client({ agentId: 'agent_test' });
  const sending = instance.send('  Hello  ', { context: 'Earlier conversation' });
  const socket = FakeWebSocket.instances[0];

  assert.equal(socket.url, 'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_test');
  socket.open();
  assert.equal(await sending, true);
  assert.deepEqual(socket.sent.map((message) => JSON.parse(message)), [
    {
      type: 'conversation_initiation_client_data',
      conversation_config_override: { conversation: { text_only: true } },
      dynamic_variables: {},
    },
    { type: 'contextual_update', text: 'Earlier conversation' },
    { type: 'user_message', text: 'Hello' },
  ]);
});

test('signed session sends its dynamic variables and handles streaming and ping events', async () => {
  const { instance, events, statuses } = client({
    sessionProvider: async () => ({
      signed_url: 'wss://signed.example/session',
      dynamic_variables: { kiddo_user_id: '42' },
    }),
  });
  const connecting = instance.connect();
  await Promise.resolve();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  assert.equal(await connecting, true);
  assert.deepEqual(JSON.parse(socket.sent[0]), {
    type: 'conversation_initiation_client_data',
    conversation_config_override: { conversation: { text_only: true } },
    dynamic_variables: { kiddo_user_id: '42' },
  });

  socket.receive({ type: 'agent_chat_response_part', text_response_part: { type: 'start' } });
  socket.receive({ type: 'agent_chat_response_part', text_response_part: { type: 'delta', text: 'Hi' } });
  socket.receive({ type: 'agent_chat_response_part', text_response_part: { type: 'stop' } });
  socket.receive({ type: 'ping', ping_event: { event_id: 'ping-1' } });

  assert.deepEqual(events, [
    { type: 'response_start' },
    { type: 'response_delta', text: 'Hi' },
    { type: 'response_complete' },
  ]);
  assert.deepEqual(JSON.parse(socket.sent.at(-1)), { type: 'pong', event_id: 'ping-1' });
  assert.deepEqual(statuses, ['connecting', 'connected']);
});

test('a session provider may defer connection without opening a socket', async () => {
  const { instance, statuses } = client({ sessionProvider: async () => null });

  assert.equal(await instance.connect(), false);
  assert.equal(FakeWebSocket.instances.length, 0);
  assert.deepEqual(statuses, ['connecting', 'disconnected']);
});

test('full agent responses and errors are normalized', async () => {
  const { instance, events } = client({ agentId: 'agent_test' });
  const connecting = instance.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  await connecting;

  socket.receive({ type: 'agent_response', agent_response_event: { agent_response: 'Answer' } });
  socket.receive({ type: 'error', message: 'Unavailable' });
  socket.receive({ data: 'not json' });

  assert.deepEqual(events, [
    { type: 'response', text: 'Answer' },
    { type: 'agent_error', error: 'Unavailable' },
  ]);
});
