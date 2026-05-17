# WebSockets

## Quick Reference

- WebSocket protocol (RFC 6455) provides full-duplex, bidirectional communication over a single TCP connection
- Connection starts with HTTP Upgrade handshake: client sends `Upgrade: websocket` + `Sec-WebSocket-Key`, server responds with `101 Switching Protocols`
- Frame format: 2-14 byte header with opcode (text=0x1, binary=0x2, close=0x8, ping=0x9, pong=0xA), payload length, and optional masking key
- Client-to-server frames MUST be masked (XOR with 4-byte key) to prevent cache poisoning attacks on intermediary proxies
- Ping/pong frames provide application-level keepalive — essential since TCP keepalive defaults to 2+ hours
- Close handshake: initiator sends close frame with status code → peer responds with close frame → TCP connection terminates
- Common close codes: 1000 (normal), 1001 (going away), 1006 (abnormal/no close frame), 1011 (server error), 1012 (service restart)
- WebSocket URL schemes: `ws://` (unencrypted, port 80) and `wss://` (TLS encrypted, port 443)
- Maximum frame payload: 2^63 bytes theoretically, but practical implementations limit to 1-16MB to prevent memory exhaustion

## When to Use

WebSockets are the right choice when your application requires low-latency, bidirectional communication where both client and server need to send messages independently at any time. The canonical use cases include real-time chat applications, live collaborative editing (Google Docs, Figma), financial trading dashboards with streaming price updates, multiplayer gaming, live sports scores, and IoT device communication.

Choose WebSockets over HTTP polling when: message frequency is high (more than 1 message per second), latency requirements are strict (sub-100ms delivery), communication is bidirectional (server needs to push without client requesting), or the overhead of HTTP headers per message is significant relative to payload size. A chat message of 50 bytes with 500+ bytes of HTTP headers per poll request is extremely wasteful compared to a 6-byte WebSocket frame header.

Do NOT use WebSockets when: communication is primarily request-response (use HTTP), updates are infrequent and unidirectional server-to-client (use Server-Sent Events), you need request/response semantics with strong typing (use gRPC streaming), or your infrastructure doesn't support long-lived connections (some corporate proxies, older load balancers). WebSockets add operational complexity — connection state management, reconnection logic, horizontal scaling challenges — that isn't justified for simple use cases.

## Code Examples

```typescript
// Production WebSocket server with rooms, heartbeat, and graceful shutdown
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

interface Client {
  id: string;
  ws: WebSocket;
  rooms: Set<string>;
  lastPong: number;
  metadata: Record<string, unknown>;
}

class WebSocketBroker {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private rooms: Map<string, Set<string>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(port: number) {
    const server = createServer({
      cert: readFileSync('server.crt'),
      key: readFileSync('server.key'),
    });

    this.wss = new WebSocketServer({ 
      server,
      maxPayload: 1024 * 1024, // 1MB max message size
      perMessageDeflate: {
        zlibDeflateOptions: { chunkSize: 1024, memLevel: 7, level: 3 },
        threshold: 128, // Only compress messages > 128 bytes
      },
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    server.listen(port, () => console.log(`WSS listening on port ${port}`));
    
    // Start heartbeat checker
    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), 30000);
  }

  private handleConnection(ws: WebSocket, req: any): void {
    if (this.isShuttingDown) {
      ws.close(1012, 'Server restarting');
      return;
    }

    const clientId = randomUUID();
    const client: Client = {
      id: clientId,
      ws,
      rooms: new Set(),
      lastPong: Date.now(),
      metadata: { ip: req.socket.remoteAddress, connectedAt: Date.now() },
    };

    this.clients.set(clientId, client);
    console.log(`Client connected: ${clientId} (total: ${this.clients.size})`);

    // Send connection acknowledgment
    this.send(ws, { type: 'connected', clientId, timestamp: Date.now() });

    ws.on('pong', () => {
      client.lastPong = Date.now();
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(client, message);
      } catch (err) {
        this.send(ws, { type: 'error', message: 'Invalid JSON' });
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`Client disconnected: ${clientId} (code: ${code})`);
      this.removeClient(clientId);
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error for ${clientId}:`, err.message);
      this.removeClient(clientId);
    });
  }

  private handleMessage(client: Client, message: any): void {
    switch (message.type) {
      case 'join':
        this.joinRoom(client, message.room);
        break;
      case 'leave':
        this.leaveRoom(client, message.room);
        break;
      case 'broadcast':
        this.broadcastToRoom(message.room, {
          type: 'message',
          from: client.id,
          room: message.room,
          payload: message.payload,
          timestamp: Date.now(),
        }, client.id);
        break;
      case 'direct':
        this.sendToClient(message.targetId, {
          type: 'direct',
          from: client.id,
          payload: message.payload,
          timestamp: Date.now(),
        });
        break;
    }
  }

  private joinRoom(client: Client, room: string): void {
    client.rooms.add(room);
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(client.id);
    this.send(client.ws, { type: 'joined', room, members: this.rooms.get(room)!.size });
  }

  private leaveRoom(client: Client, room: string): void {
    client.rooms.delete(room);
    this.rooms.get(room)?.delete(client.id);
    if (this.rooms.get(room)?.size === 0) {
      this.rooms.delete(room);
    }
  }

  private broadcastToRoom(room: string, message: any, excludeId?: string): void {
    const members = this.rooms.get(room);
    if (!members) return;

    const payload = JSON.stringify(message);
    for (const memberId of members) {
      if (memberId === excludeId) continue;
      const client = this.clients.get(memberId);
      if (client?.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  private sendToClient(targetId: string, message: any): void {
    const client = this.clients.get(targetId);
    if (client?.ws.readyState === WebSocket.OPEN) {
      this.send(client.ws, message);
    }
  }

  private send(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all rooms
    for (const room of client.rooms) {
      this.rooms.get(room)?.delete(clientId);
      if (this.rooms.get(room)?.size === 0) {
        this.rooms.delete(room);
      }
    }
    this.clients.delete(clientId);
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    const timeout = 60000; // 60 seconds without pong = dead

    for (const [id, client] of this.clients) {
      if (now - client.lastPong > timeout) {
        console.log(`Heartbeat timeout for ${id}`);
        client.ws.terminate(); // Force close without close handshake
        this.removeClient(id);
      } else {
        client.ws.ping(); // Send ping, expect pong
      }
    }
  }

  async gracefulShutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    // Notify all clients of impending shutdown
    for (const [, client] of this.clients) {
      client.ws.close(1012, 'Server shutting down');
    }

    // Wait for connections to close (max 30 seconds)
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this.clients.size === 0) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 30000);
    });

    this.wss.close();
  }
}
```

```typescript
// WebSocket client with automatic reconnection, exponential backoff, and message queuing

interface ReconnectConfig {
  initialDelay: number;   // seconds
  maxDelay: number;       // seconds
  multiplier: number;
  jitter: number;         // Random jitter factor
  maxAttempts: number;    // 0 = unlimited
}

interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

type EventHandler = (data: unknown) => void | Promise<void>;

class ResilientWebSocketClient {
  /** WebSocket client with automatic reconnection and message queuing. */

  private url: string;
  private config: ReconnectConfig;
  private ws: WebSocket | null = null;
  private running = false;
  private reconnectAttempt = 0;
  private messageQueue: string[] = [];
  private readonly maxQueueSize = 1000;
  private handlers: Map<string, EventHandler[]> = new Map();
  private connectedResolve: (() => void) | null = null;

  constructor(url: string, config?: Partial<ReconnectConfig>) {
    this.url = url;
    this.config = {
      initialDelay: config?.initialDelay ?? 1.0,
      maxDelay: config?.maxDelay ?? 60.0,
      multiplier: config?.multiplier ?? 2.0,
      jitter: config?.jitter ?? 0.5,
      maxAttempts: config?.maxAttempts ?? 0,
    };
  }

  /** Register event handler for message types. */
  on(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  /** Start the connection with automatic reconnection. */
  async connect(): Promise<void> {
    this.running = true;

    while (this.running) {
      try {
        await this.attemptConnection();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.log(`Connection failed: ${reason}`);
        this.emit('error', { error: reason });
      }

      this.ws = null;

      if (!this.running) break;

      // Exponential backoff with jitter
      const delay = this.calculateBackoff();
      console.log(`Reconnecting in ${delay.toFixed(1)}s (attempt ${this.reconnectAttempt + 1})`);
      await this.sleep(delay * 1000);
      this.reconnectAttempt++;

      if (this.config.maxAttempts > 0 && this.reconnectAttempt >= this.config.maxAttempts) {
        console.log('Max reconnection attempts reached');
        this.running = false;
        break;
      }
    }
  }

  private attemptConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        console.log(`Connected to ${this.url}`);
        this.emit('connected', {});

        // Flush queued messages
        this.flushQueue();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data as string);
      };

      this.ws.onclose = (event: CloseEvent) => {
        console.log(`Connection closed: code=${event.code} reason=${event.reason}`);
        this.emit('disconnected', { code: event.code, reason: event.reason });
        resolve();
      };

      this.ws.onerror = (event: Event) => {
        reject(new Error('WebSocket error'));
      };
    });
  }

  /** Send message, queuing if disconnected. */
  async send(messageType: string, payload: unknown): Promise<void> {
    const message = JSON.stringify({
      type: messageType,
      payload,
      timestamp: Date.now() / 1000,
    } satisfies WebSocketMessage);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(message);
      } catch {
        this.enqueue(message);
      }
    } else {
      this.enqueue(message);
    }
  }

  /** Send message and wait for a specific response type. */
  async sendAndWait(messageType: string, payload: unknown,
                    responseType: string, timeout = 10000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeHandler(responseType, handler);
        reject(new Error(`No ${responseType} response within ${timeout}ms`));
      }, timeout);

      const handler: EventHandler = (data) => {
        clearTimeout(timer);
        this.removeHandler(responseType, handler);
        resolve(data);
      };

      this.on(responseType, handler);
      this.send(messageType, payload);
    });
  }

  /** Gracefully close the connection. */
  async close(): Promise<void> {
    this.running = false;
    if (this.ws) {
      this.ws.close(1000, 'Client closing');
    }
  }

  /** Exponential backoff with full jitter. */
  private calculateBackoff(): number {
    const delay = Math.min(
      this.config.initialDelay * (this.config.multiplier ** this.reconnectAttempt),
      this.config.maxDelay
    );
    // Full jitter: random value between 0 and calculated delay
    const jitter = Math.random() * delay * this.config.jitter;
    return delay + jitter;
  }

  /** Send all queued messages after reconnection. */
  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift()!;
      try {
        this.ws.send(message);
      } catch {
        this.messageQueue.unshift(message);
        break;
      }
    }
  }

  /** Parse and dispatch incoming message to handlers. */
  private handleMessage(raw: string): void {
    try {
      const data = JSON.parse(raw) as WebSocketMessage;
      const msgType = data.type ?? 'unknown';
      this.emit(msgType, data.payload ?? data);
    } catch {
      this.emit('raw', raw);
    }
  }

  /** Emit event to registered handlers. */
  private emit(eventType: string, data: unknown): void {
    const handlers = [
      ...(this.handlers.get(eventType) ?? []),
      ...(this.handlers.get('*') ?? []),
    ];
    for (const handler of handlers) {
      handler(data);
    }
  }

  private enqueue(message: string): void {
    if (this.messageQueue.length >= this.maxQueueSize) {
      this.messageQueue.shift(); // Drop oldest
    }
    this.messageQueue.push(message);
  }

  private removeHandler(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Usage
async function main() {
  const client = new ResilientWebSocketClient(
    'wss://api.example.com/ws',
    { initialDelay: 1, maxDelay: 30, jitter: 0.5 }
  );

  client.on('message', (data) => console.log(`Received: ${JSON.stringify(data)}`));
  client.on('connected', () => console.log('Connected!'));

  // Run connection in background
  client.connect();

  // Send messages (queued if not yet connected)
  await new Promise((r) => setTimeout(r, 2000));
  await client.send('subscribe', { channel: 'prices' });

  await new Promise((r) => setTimeout(r, 60000));
  await client.close();
}

main();
```

```go
// Server-Sent Events (SSE) alternative for unidirectional streaming
package main

import (
    "fmt"
    "net/http"
    "time"
)

// SSEBroker manages SSE client connections and broadcasts
type SSEBroker struct {
    clients    map[chan string]struct{}
    register   chan chan string
    unregister chan chan string
    broadcast  chan string
}

func NewSSEBroker() *SSEBroker {
    b := &SSEBroker{
        clients:    make(map[chan string]struct{}),
        register:   make(chan chan string),
        unregister: make(chan chan string),
        broadcast:  make(chan string, 256),
    }
    go b.run()
    return b
}

func (b *SSEBroker) run() {
    for {
        select {
        case client := <-b.register:
            b.clients[client] = struct{}{}
            fmt.Printf("Client connected (total: %d)\n", len(b.clients))
        case client := <-b.unregister:
            delete(b.clients, client)
            close(client)
            fmt.Printf("Client disconnected (total: %d)\n", len(b.clients))
        case msg := <-b.broadcast:
            for client := range b.clients {
                select {
                case client <- msg:
                default:
                    // Client buffer full, skip (or disconnect)
                    delete(b.clients, client)
                    close(client)
                }
            }
        }
    }
}

func (b *SSEBroker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    // SSE requires streaming response
    flusher, ok := w.(http.Flusher)
    if !ok {
        http.Error(w, "Streaming not supported", http.StatusInternalServerError)
        return
    }

    // Set SSE headers
    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")
    w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering

    // Register client
    messageChan := make(chan string, 64)
    b.register <- messageChan

    // Clean up on disconnect
    ctx := r.Context()
    defer func() { b.unregister <- messageChan }()

    // Send initial connection event
    fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"ok\"}\n\n")
    flusher.Flush()

    for {
        select {
        case <-ctx.Done():
            return
        case msg, ok := <-messageChan:
            if !ok {
                return
            }
            // SSE format: "data: <payload>\n\n"
            fmt.Fprintf(w, "data: %s\n\n", msg)
            flusher.Flush()
        }
    }
}

func main() {
    broker := NewSSEBroker()

    // Simulate events
    go func() {
        ticker := time.NewTicker(time.Second)
        for t := range ticker.C {
            broker.broadcast <- fmt.Sprintf(
                `{"type":"tick","time":"%s"}`, t.Format(time.RFC3339))
        }
    }()

    http.Handle("/events", broker)
    http.ListenAndServe(":8080", nil)
}
```

## Common Pitfalls

- **Not implementing application-level heartbeats**: TCP keepalive defaults to 2+ hours, and many NAT gateways/load balancers silently drop idle connections after 60-350 seconds. Without ping/pong frames at 15-30 second intervals, connections appear alive to the application but are actually dead at the network level. The server sends pings and expects pongs within a timeout; missing pongs trigger connection cleanup.

- **Thundering herd on reconnection**: When a WebSocket server restarts, all clients reconnect simultaneously, potentially overwhelming the server. Implement exponential backoff with full jitter (random delay between 0 and the calculated backoff) so reconnections spread over time. Without jitter, clients using the same backoff algorithm reconnect in synchronized waves.

- **Unbounded message queues causing memory exhaustion**: Queuing messages during disconnection without limits can exhaust memory if the disconnection is prolonged. Set maximum queue sizes (e.g., 1000 messages or 10MB), implement queue eviction policies (drop oldest, drop by priority), and consider persisting critical messages to disk or a message broker rather than in-memory queues.

- **Not handling WebSocket connection limits per server**: Each WebSocket connection consumes a file descriptor, memory for the connection object (~10-50KB), and any subscription/session state. A server with 2GB of available memory can typically handle 50,000-100,000 connections. Without connection limits and monitoring, a traffic spike can OOM the server. Implement connection admission control and connection-aware autoscaling.

- **Ignoring message ordering guarantees across server instances**: When scaling horizontally with a pub/sub backbone (Redis Pub/Sub), messages from different publishers may arrive at subscribers in different orders across different server instances. If ordering matters, include sequence numbers in messages and implement client-side reordering, or use an ordered message broker (Kafka with partition keys).

- **Sending large payloads without fragmentation**: Sending a 10MB message as a single WebSocket frame blocks the connection for the entire transmission duration, preventing ping/pong frames and other messages from being processed. Fragment large messages into smaller chunks (e.g., 64KB) with sequence metadata, allowing interleaving with control frames and enabling progress tracking.

## Real-World Use Cases

**Real-Time Collaborative Editing**: Applications like Google Docs and Figma use WebSockets to synchronize document state across multiple editors in real-time. Each keystroke or drawing operation is sent as a small WebSocket message, and the server broadcasts it to all other connected editors. Conflict resolution uses Operational Transformation (OT) or CRDTs to merge concurrent edits. The networking challenge is maintaining sub-50ms delivery latency while handling thousands of concurrent editors per document.

**Financial Trading Platforms**: Stock exchanges and trading platforms stream real-time price updates, order book changes, and trade executions over WebSockets. A typical crypto exchange sends 10,000+ messages per second per client during high volatility. Binary WebSocket frames (MessagePack or Protocol Buffers) reduce bandwidth compared to JSON. Clients must handle backpressure — if processing can't keep up with the stream, they need to skip stale updates rather than accumulating an ever-growing queue.

**Live Dashboards and Monitoring**: Observability platforms (Grafana, Datadog) use WebSockets to push metric updates, alert notifications, and log streams to browser dashboards. The server maintains per-client subscription state (which metrics, which time range, which filters) and sends only relevant updates. Connection multiplexing allows a single WebSocket to carry multiple independent data streams (metrics, alerts, logs) using message type routing.

**Multiplayer Gaming**: Online games use WebSockets (or custom UDP protocols for twitch games) to synchronize game state between players. The server runs the authoritative game simulation and broadcasts state updates at 20-60Hz. Client-side prediction and server reconciliation handle the latency gap. WebSocket's TCP guarantee of ordered delivery is acceptable for turn-based and strategy games but problematic for fast-paced shooters where a lost packet delays all subsequent updates.

## Interview Questions

**Q: Compare WebSockets, Server-Sent Events (SSE), and long polling. When would you choose each?**

A: WebSockets provide full-duplex bidirectional communication — both client and server can send messages independently. Use for chat, gaming, collaborative editing, or any scenario requiring bidirectional real-time communication. SSE provides unidirectional server-to-client streaming over standard HTTP — simpler than WebSockets, works through HTTP proxies, supports automatic reconnection with `Last-Event-ID`, but only server can push. Use for live feeds, notifications, dashboards where the client only needs to receive updates. Long polling is an HTTP request that the server holds open until data is available, then responds and the client immediately reconnects. Use when WebSockets are blocked (corporate firewalls), when you need HTTP semantics (caching, auth), or for low-frequency updates where maintaining a persistent connection isn't justified.

**Q: How would you scale a WebSocket-based chat application to millions of concurrent users?**

A: Horizontally scale WebSocket servers behind a load balancer with sticky sessions (so reconnections reach the same server). Use a pub/sub backbone (Redis Pub/Sub for simplicity, Kafka for durability) to broadcast messages across server instances — when user A on server 1 sends a message to user B on server 3, the message routes through the pub/sub layer. Implement connection-aware autoscaling (scale on connection count, not CPU). Use connection draining during deployments (GOAWAY equivalent, redirect new connections to new servers while existing connections finish). Shard chat rooms across server groups to limit pub/sub fan-out. For millions of users, consider a hierarchical architecture: edge servers handle WebSocket connections, relay servers aggregate and route messages, and backend servers handle persistence and business logic.

**Q: What happens if a WebSocket server needs to deploy a new version? How do you handle existing connections?**

A: Implement graceful connection draining: 1) Remove the server from the load balancer's active pool (stop receiving new connections). 2) Send a close frame with code 1012 (Service Restart) or a custom application message telling clients to reconnect. 3) Wait a grace period (30-60 seconds) for in-flight messages to complete. 4) Force-terminate remaining connections. 5) Shut down the server. On the client side, implement reconnection logic that handles code 1012 by reconnecting immediately (no backoff) to a different server. The load balancer routes the reconnection to an updated server. For zero-downtime deployments, use rolling updates where only a fraction of servers drain at a time, ensuring capacity is always available for reconnecting clients.

**Q: How do you detect and handle dead WebSocket connections?**

A: Implement a multi-layer detection strategy: 1) Application-level ping/pong: server sends WebSocket ping frames every 20-30 seconds, expects pong within 10 seconds. Missing pongs indicate a dead connection. 2) Read timeout: if no data (including pong) is received within 60 seconds, consider the connection dead. 3) Write detection: if a send operation fails or buffers grow unboundedly, the connection is dead. On detection, terminate the connection (not graceful close — the peer is unreachable), clean up server-side state (subscriptions, room membership), and notify other interested parties (e.g., "user went offline" in chat). The client side mirrors this: if no data or pong is received within the timeout, close and reconnect with exponential backoff.

## Production Tips

- **Implement connection-aware autoscaling**: Traditional CPU/memory-based autoscaling doesn't work well for WebSocket servers because connections consume memory linearly but minimal CPU when idle. Scale based on active connection count per instance (e.g., scale up at 80% of max connections, scale down at 30%). Include connection draining time in scale-down cooldown periods to avoid thrashing.

- **Use Redis Pub/Sub or NATS for cross-server message routing**: When horizontally scaled, a message sent to server A must reach subscribers on server B. Redis Pub/Sub is simple but has no persistence (missed messages during reconnection are lost). NATS JetStream or Kafka provide durability and replay. Choose based on whether missed messages during brief disconnections are acceptable for your use case.

- **Monitor WebSocket-specific metrics**: Track connection count per server, message throughput (messages/second in and out), message latency (time from send to delivery), reconnection rate (high rate indicates instability), and frame error rate. Alert on connection count approaching limits, sustained high reconnection rates, and message delivery latency exceeding SLA.

- **Implement backpressure for slow consumers**: If a client can't consume messages as fast as they're produced (slow network, overloaded browser tab), the server-side send buffer grows. Implement per-client send buffer limits — when exceeded, either drop low-priority messages, send a "you're behind" notification and skip to latest state, or disconnect the client. Without backpressure, one slow client can cause server memory exhaustion.

## Related Topics

- [HTTP](./http.md) — WebSocket connections begin with an HTTP Upgrade handshake and share port 80/443 with HTTP traffic
- [Load Balancing](./load-balancing.md) — WebSocket scaling requires sticky sessions or connection-aware routing at the load balancer
- [TCP/IP](./tcp-ip.md) — WebSockets operate over TCP, inheriting its reliability guarantees and connection lifecycle
- [TLS & mTLS](./tls-mtls.md) — WSS (WebSocket Secure) uses TLS encryption, requiring proper certificate configuration
