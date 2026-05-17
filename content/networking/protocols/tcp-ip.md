# TCP/IP

## Quick Reference

- The TCP/IP model has four layers: Link (frames), Internet (packets), Transport (segments/datagrams), Application (messages)
- TCP three-way handshake: SYN (seq=x) → SYN-ACK (seq=y, ack=x+1) → ACK (ack=y+1) establishes bidirectional communication
- TCP provides reliable, ordered byte streams; UDP provides unreliable, unordered datagrams with minimal 8-byte header overhead
- Congestion control algorithms (Slow Start, Congestion Avoidance, Fast Retransmit, Fast Recovery) dynamically adjust sending rate based on detected loss
- TCP flow control uses a sliding window where the receiver advertises available buffer space (rwnd) to prevent overwhelming slow consumers
- Socket API abstracts network communication into file-descriptor-like operations: socket(), bind(), listen(), accept(), connect(), send(), recv(), close()
- Maximum Segment Size (MSS) is typically 1460 bytes (1500 MTU minus 20-byte IP header minus 20-byte TCP header)
- TIME_WAIT state lasts 2×MSL (typically 60 seconds) to handle delayed duplicate segments after connection close
- TCP keepalive defaults to 2 hours of idle time before probing — far too long for most application-level health detection

## When to Use

TCP is the correct choice when your application requires guaranteed delivery, ordering, and data integrity. This includes HTTP/HTTPS communication, database connections, file transfers, email protocols (SMTP, IMAP), and any RPC framework (gRPC, Thrift). Use TCP when losing even a single byte would corrupt the application-level message or when messages must arrive in the exact order they were sent.

UDP is appropriate when low latency matters more than reliability, when the application handles its own reliability at a higher layer, or when multicast/broadcast is needed. Common UDP use cases include DNS queries (small request-response pairs where retransmission is simpler than connection setup), video/audio streaming (late packets are useless — better to skip than wait), online gaming (position updates supersede previous ones), and protocols like QUIC that build custom reliability on top of UDP.

Understanding TCP internals is essential when tuning connection pools for microservices, diagnosing latency spikes caused by retransmission timeouts, configuring load balancer health checks, debugging connection reset issues in production, or designing custom protocols. Socket programming knowledge is required for building network servers, implementing custom protocol handlers, and understanding how frameworks like Netty, libuv, and Tokio work under the hood.

## Code Examples

```java
import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

// TCP server with connection handling and proper shutdown
public class TCPServer {
    private final String host;
    private final int port;
    private final int backlog;
    private ServerSocket serverSocket;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final ExecutorService threadPool = Executors.newCachedThreadPool();

    public TCPServer(String host, int port, int backlog) {
        this.host = host;
        this.port = port;
        this.backlog = backlog;
    }

    public TCPServer() {
        this("0.0.0.0", 8080, 128);
    }

    public void start() throws IOException {
        serverSocket = new ServerSocket();

        // SO_REUSEADDR allows binding to a port in TIME_WAIT state
        serverSocket.setReuseAddress(true);

        serverSocket.bind(new InetSocketAddress(host, port), backlog);
        running.set(true);

        System.out.printf("TCP server listening on %s:%d%n", host, port);

        while (running.get()) {
            try {
                Socket clientSocket = serverSocket.accept();
                // TCP_NODELAY disables Nagle's algorithm for low-latency messaging
                clientSocket.setTcpNoDelay(true);
                // Each connection handled in a separate thread
                threadPool.submit(() -> handleClient(clientSocket));
            } catch (SocketException e) {
                break; // Server socket closed
            }
        }
    }

    private void handleClient(Socket clientSocket) {
        // Handle a single client connection with length-prefixed framing
        InetSocketAddress address = (InetSocketAddress) clientSocket.getRemoteSocketAddress();
        System.out.printf("Connection from %s:%d%n", address.getHostString(), address.getPort());

        try (InputStream in = clientSocket.getInputStream();
             OutputStream out = clientSocket.getOutputStream()) {

            while (true) {
                // Read 4-byte length prefix (network byte order)
                byte[] lengthData = recvExact(in, 4);
                if (lengthData == null) break;

                int msgLength = ByteBuffer.wrap(lengthData).getInt();

                // Read the full message
                byte[] message = recvExact(in, msgLength);
                if (message == null) break;

                // Echo back with uppercase transformation
                byte[] response = new String(message).toUpperCase().getBytes();

                // Send length-prefixed response
                ByteBuffer header = ByteBuffer.allocate(4);
                header.putInt(response.length);
                out.write(header.array());
                out.write(response);
                out.flush();
            }
        } catch (SocketException e) {
            System.out.printf("Connection reset by %s%n", address);
        } catch (IOException e) {
            System.out.printf("Error handling client %s: %s%n", address, e.getMessage());
        } finally {
            try { clientSocket.close(); } catch (IOException ignored) {}
        }
    }

    private byte[] recvExact(InputStream in, int numBytes) throws IOException {
        // Receive exactly numBytes from stream, handling partial reads
        byte[] data = new byte[numBytes];
        int offset = 0;
        while (offset < numBytes) {
            int bytesRead = in.read(data, offset, numBytes - offset);
            if (bytesRead == -1) return null; // Connection closed
            offset += bytesRead;
        }
        return data;
    }

    public void stop() throws IOException {
        running.set(false);
        serverSocket.close();
        threadPool.shutdown();
    }
}
```

```java
// Non-blocking TCP server using Java NIO (event-driven I/O multiplexing)
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.*;
import java.util.Iterator;
import java.util.Set;

public class NonBlockingTCPServer {
    private final int port;
    private Selector selector;
    private ServerSocketChannel serverChannel;

    public NonBlockingTCPServer(int port) {
        this.port = port;
    }

    public void start() throws IOException {
        // Selector multiplexes multiple channels (like epoll/kqueue)
        selector = Selector.open();
        
        serverChannel = ServerSocketChannel.open();
        serverChannel.bind(new InetSocketAddress(port));
        serverChannel.configureBlocking(false);
        
        // Register for ACCEPT events
        serverChannel.register(selector, SelectionKey.OP_ACCEPT);
        
        System.out.println("NIO server listening on port " + port);
        
        while (true) {
            // Block until at least one channel is ready
            selector.select();
            
            Set<SelectionKey> selectedKeys = selector.selectedKeys();
            Iterator<SelectionKey> iterator = selectedKeys.iterator();
            
            while (iterator.hasNext()) {
                SelectionKey key = iterator.next();
                iterator.remove();
                
                if (key.isAcceptable()) {
                    handleAccept(key);
                } else if (key.isReadable()) {
                    handleRead(key);
                }
            }
        }
    }

    private void handleAccept(SelectionKey key) throws IOException {
        ServerSocketChannel server = (ServerSocketChannel) key.channel();
        SocketChannel client = server.accept();
        client.configureBlocking(false);
        
        // Register new client for READ events with a buffer attachment
        ByteBuffer buffer = ByteBuffer.allocate(4096);
        client.register(selector, SelectionKey.OP_READ, buffer);
        
        System.out.println("Accepted: " + client.getRemoteAddress());
    }

    private void handleRead(SelectionKey key) throws IOException {
        SocketChannel client = (SocketChannel) key.channel();
        ByteBuffer buffer = (ByteBuffer) key.attachment();
        
        int bytesRead = client.read(buffer);
        
        if (bytesRead == -1) {
            // Client disconnected
            client.close();
            key.cancel();
            return;
        }
        
        // Flip buffer for reading, then echo back
        buffer.flip();
        while (buffer.hasRemaining()) {
            client.write(buffer);
        }
        buffer.clear();
    }
}
```

```go
// UDP server demonstrating connectionless datagram communication
package main

import (
    "fmt"
    "net"
    "time"
)

func main() {
    // UDP uses PacketConn - no connection establishment
    addr, err := net.ResolveUDPAddr("udp", ":9090")
    if err != nil {
        panic(err)
    }

    conn, err := net.ListenUDP("udp", addr)
    if err != nil {
        panic(err)
    }
    defer conn.Close()

    // Set read buffer size (OS-level receive buffer)
    conn.SetReadBuffer(1024 * 1024) // 1MB buffer

    fmt.Println("UDP server listening on :9090")

    buffer := make([]byte, 65535) // Max UDP payload size
    for {
        // ReadFromUDP returns data + sender address (no connection state)
        n, remoteAddr, err := conn.ReadFromUDP(buffer)
        if err != nil {
            fmt.Printf("Read error: %v\n", err)
            continue
        }

        // Process datagram (each is independent, may arrive out of order)
        message := string(buffer[:n])
        fmt.Printf("[%s] From %s: %s\n", time.Now().Format("15:04:05"), remoteAddr, message)

        // Reply to sender (no connection needed)
        response := fmt.Sprintf("ACK: %s", message)
        conn.WriteToUDP([]byte(response), remoteAddr)
    }
}
```

## Common Pitfalls

- **Ignoring TCP slow start on new connections**: Fresh TCP connections begin with a small congestion window (typically 10 segments, ~14KB). Short-lived connections never reach full throughput. This is why connection pooling and HTTP/2 multiplexing are critical — they amortize the slow start penalty across many requests. A cold connection to a server 100ms away takes 3-4 round trips just to ramp up the window enough for a 100KB response.

- **Nagle's algorithm combined with delayed ACK**: Nagle's algorithm buffers small writes until an ACK arrives (to coalesce small packets), while delayed ACK waits up to 40ms before acknowledging (to piggyback ACKs on data). Together they create a 40ms latency floor for small interactive messages. Always set `TCP_NODELAY` for latency-sensitive protocols like gaming, real-time messaging, or RPC frameworks. Most modern frameworks (gRPC, HTTP/2 libraries) set this by default.

- **Not handling partial reads/writes**: TCP is a byte stream, not a message stream. A single `send()` of 1000 bytes may require multiple `recv()` calls to read completely, and a single `recv()` may return data from multiple `send()` calls. Always implement message framing (length-prefix, delimiter, or fixed-size) and loop on recv until the complete message is assembled. This is the most common socket programming bug.

- **TIME_WAIT accumulation exhausting ephemeral ports**: The active closer enters TIME_WAIT for 2×MSL (60-120 seconds). High-throughput clients creating many short connections can exhaust the ~28,000 ephemeral ports available per destination IP. Solutions: connection pooling, `SO_REUSEADDR`, `tcp_tw_reuse` sysctl (Linux), or increasing the ephemeral port range.

- **Confusing connection timeout with read timeout**: Connection timeout is how long to wait for the TCP handshake to complete (SYN → SYN-ACK). Read timeout is how long to wait for data after the connection is established. Setting only a read timeout means a connection attempt to an unreachable host blocks indefinitely. Always configure both independently.

- **Assuming TCP keepalive detects dead connections quickly**: Default TCP keepalive waits 2 hours before sending the first probe, then sends probes every 75 seconds, declaring the connection dead after 9 failed probes. That's over 2 hours of undetected failure. Application-level heartbeats (every 15-30 seconds) are essential for timely dead connection detection.

- **Buffer bloat causing latency spikes**: Large socket send buffers can queue hundreds of milliseconds of data, masking congestion from the application. When the buffer finally fills, the application sees a sudden latency spike. For latency-sensitive applications, use smaller buffers and monitor `SO_SNDBUF` utilization. TCP BBR congestion control algorithm handles this better than loss-based algorithms like CUBIC.

## Real-World Use Cases

**Connection Pooling in Microservices**: Services like those at Netflix maintain pools of pre-established TCP connections to downstream services. A typical pool configuration maintains 10-50 connections per downstream host, with idle timeout of 60 seconds, maximum lifetime of 5 minutes (to rebalance after scaling events), and connection validation via lightweight health check before reuse. This eliminates the 1-3 RTT overhead of TCP+TLS handshake on every request, reducing p99 latency by 100-300ms.

**High-Frequency Trading Networks**: Financial exchanges use kernel-bypass networking (DPDK, RDMA) to eliminate the overhead of the kernel TCP/IP stack. TCP connections between trading systems use `TCP_NODELAY`, custom congestion control (or no congestion control on private networks), and busy-polling to achieve single-digit microsecond latencies. The TCP stack is often replaced entirely with custom reliable UDP protocols optimized for the specific traffic pattern.

**Database Connection Management**: PostgreSQL and MySQL connections are expensive to establish (authentication, session setup, memory allocation). Connection poolers like PgBouncer maintain a pool of backend connections and multiplex client connections onto them. Understanding TCP connection states is essential for diagnosing issues like connection storms after pooler restarts, half-open connections after network partitions, and connection leaks from applications not properly closing connections.

**Container Networking**: Kubernetes pod-to-pod communication traverses virtual ethernet pairs, Linux bridges, and overlay networks (VXLAN, Geneve). Each layer adds encapsulation overhead reducing effective MTU. Understanding TCP MSS negotiation, path MTU discovery, and fragmentation behavior is critical for diagnosing mysterious packet drops and performance degradation in containerized environments.

## Interview Questions

**Q: Walk through the TCP three-way handshake and explain why three packets are needed instead of two.**

A: The three-way handshake (SYN → SYN-ACK → ACK) establishes bidirectional communication and synchronizes sequence numbers. The client sends SYN with its initial sequence number (ISN). The server responds with SYN-ACK containing its own ISN and acknowledging the client's. The client sends ACK confirming the server's ISN. Three packets are needed because both sides must independently choose and confirm sequence numbers — two packets would only confirm one direction. The third packet also prevents old duplicate SYN segments from establishing phantom connections (the "network duplicate" problem). Without the third packet, a delayed SYN from a previous connection could cause the server to allocate resources for a connection the client never intended.

**Q: Explain TCP congestion control — how does TCP detect and respond to network congestion?**

A: TCP uses loss-based signals to infer congestion. During Slow Start, the congestion window (cwnd) doubles every RTT until it hits the slow start threshold (ssthresh) or detects loss. In Congestion Avoidance, cwnd grows linearly (additive increase). When loss is detected via timeout, cwnd resets to 1 MSS and ssthresh halves (multiplicative decrease). When loss is detected via 3 duplicate ACKs, Fast Retransmit immediately resends the lost segment, and Fast Recovery halves cwnd without resetting to 1. Modern algorithms like CUBIC use a cubic function for window growth (faster recovery after loss), and BBR models the network's bandwidth-delay product directly rather than relying on loss signals, achieving better throughput on high-BDP paths.

**Q: When would you choose UDP over TCP, and what reliability mechanisms would you need to implement yourself?**

A: Choose UDP when: latency matters more than reliability (gaming, live video), when data is time-sensitive and retransmission is pointless (VoIP — a late packet is useless), when you need multicast/broadcast, or when you're building a custom protocol that needs different reliability semantics than TCP provides (like QUIC). If you need reliability over UDP, implement: sequence numbers for ordering, acknowledgments for delivery confirmation, retransmission with timeout or NACK-based recovery, congestion control to avoid overwhelming the network, and flow control to avoid overwhelming the receiver. QUIC implements all of these on top of UDP while adding stream multiplexing without head-of-line blocking.

**Q: What is the difference between `SO_REUSEADDR` and `SO_REUSEPORT`, and when would you use each?**

A: `SO_REUSEADDR` allows binding to an address that's in TIME_WAIT state, which is essential for server restarts — without it, restarting a server fails for 60+ seconds until old connections clear TIME_WAIT. It also allows multiple sockets to bind to the same port if they bind to different local addresses. `SO_REUSEPORT` (Linux 3.9+) allows multiple sockets to bind to the exact same address:port combination, with the kernel distributing incoming connections across them. Use `SO_REUSEPORT` for multi-process servers (like Nginx workers) where each process has its own accept socket, eliminating the thundering herd problem on accept() and improving multi-core scalability.

## Production Tips

- **Tune TCP keepalive for your environment**: Set `tcp_keepalive_time` to 60 seconds (not the default 7200), `tcp_keepalive_intvl` to 10 seconds, and `tcp_keepalive_probes` to 6. This detects dead connections in ~2 minutes instead of ~2.5 hours. For cloud environments with NAT gateways that silently drop idle connections (AWS NAT Gateway drops after 350 seconds), keepalive must fire before the NAT timeout.

- **Monitor TCP connection states with `ss` or `netstat`**: Track TIME_WAIT count (high = connection churn, fix with pooling), CLOSE_WAIT count (high = application bug not closing sockets), ESTABLISHED count (capacity planning), and SYN_RECV count (potential SYN flood). Set alerts on CLOSE_WAIT > 100 per process — this almost always indicates a resource leak.

- **Configure connection pool sizes based on Little's Law**: Pool size = throughput × latency. If you handle 100 requests/second to a downstream with 50ms average latency, you need at least 5 connections. Add headroom for variance: 2-3× the calculated minimum. Too few connections = queuing latency; too many = wasted memory and potential connection limits on the server side.

- **Use TCP BBR congestion control for high-latency paths**: BBR (Bottleneck Bandwidth and Round-trip propagation time) outperforms CUBIC on high-bandwidth, high-latency links (like cross-continent connections) by modeling available bandwidth rather than reacting to loss. Enable with `sysctl net.ipv4.tcp_congestion_control=bbr` on Linux 4.9+. Particularly impactful for CDN origin-pull connections and cross-region replication.

## Related Topics

- [DNS](./dns.md) — DNS resolution is the first step before any TCP connection, and DNS uses UDP for queries under 512 bytes
- [HTTP](./http.md) — HTTP relies on TCP (HTTP/1.1, HTTP/2) or UDP via QUIC (HTTP/3) for transport
- [TLS & mTLS](./tls-mtls.md) — TLS operates on top of TCP, adding encryption after the TCP handshake completes
- [Load Balancing](./load-balancing.md) — L4 load balancers operate at the TCP level, routing based on connection tuples
