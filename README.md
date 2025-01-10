# authsocket
 Mutually Authenticated Web Sockets

**Table of Contents**
1. [Overview](#overview)  
2. [Installation](#installation)  
3. [Architecture & File Structure](#architecture--file-structure)  
4. [Usage](#usage)  
   - [Server-Side Setup](#server-side-setup)
   - [Client-Side Setup](#client-side-setup)
   - [Example Communication](#example-communication)
5. [Detailed Explanations](#detailed-explanations)
   - [AuthSocketServer & AuthSocket (Server)](#authsocketserver--authsocket-server)
   - [SocketServerTransport & SocketClientTransport](#socketservertransport--socketclienttransport)
   - [Client-Side AuthSocketClient (authIO function)](#client-side-authsocketclient-authio-function)
6. [License](#license)

---

## Overview

This repository provides a **drop-in** solution for **Socket.IO** with **BRC-103** mutual authentication. In other words, you can write code like typical Socket.IO (`.on(...)`, `.emit(...)`) while under the hood each message is:

- **Signed** by the sender using BRC-103 message format,  
- **Verified** by the receiver, ensuring mutual authenticity,  
- Optionally uses **selective certificates** if needed by BRC-103.

The code includes:

1. A **server-side** library (`AuthSocketServer`, `AuthSocket`, `SocketServerTransport`) that wraps the raw Socket.IO server and enforces BRC-103 for each connected client.
2. A **client-side** library (`authIO`, `SocketClientTransport`, `AuthSocketClient`) that wraps the `socket.io-client` library, ensuring messages are signed with a local `Wallet` (BRC-103 style).

Once both sides are properly configured, you get a secure, authenticated channel with minimal changes to your usual Socket.IO code.

---

## Installation

1. **Install** the dependencies you need:
   ```bash
   npm install socket.io socket.io-client @bsv/sdk
   ```
   or 
   ```bash
   yarn add socket.io socket.io-client @bsv/sdk
   ```
   (Adjust package names depending on your actual environment.)

2. **Include** the provided code files in your project, e.g. in `src/auth-socket/`.

3. Make sure you also have a **BRC-103**-compatible `Wallet` implementation from `@bsv/sdk` or your own fork that can sign and verify messages.

---

## Usage

### Server-Side Setup

An example **server** using Express + HTTP + `AuthSocketServer`:

```ts
// server.ts
import express from 'express'
import http from 'http'
import { AuthSocketServer } from './server/AuthSocketServer'
import { SomeBRCWallet } from './myWalletImplementation' // your BRC-103 wallet

const app = express()
const server = http.createServer(app)
const port = 3000

// Provide a BRC-103-compatible wallet
const serverWallet = new SomeBRCWallet('my-private-key-hex')

const authIo = new AuthSocketServer(server, {
  wallet: serverWallet,
  cors: {
    origin: '*'
  }
})

// Classic usage
authIo.on('connection', (socket) => {
  console.log('New Authenticated Connection -> socket ID:', socket.id)

  socket.on('chatMessage', (data) => {
    console.log('Received chatMessage from client:', data)
    // Echo or broadcast
    authIo.emit('chatMessage', { from: socket.id, text: data.text })
  })

  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`)
  })
})

server.listen(port, () => {
  console.log(`Listening on port ${port}`)
})
```

1. We create an `AuthSocketServer` with a `wallet`.  
2. On `'connection'`, we get an `AuthSocket` that mimics standard Socket.IO usage.  
3. Inside `.on('chatMessage', ...)` we can do normal broadcasting or usage with `.emit(...)`.

### Client-Side Setup

An example **client** code that wraps `socket.io-client`:

```ts
// clientApp.ts
import { authIO } from './client/authIO'
import { SomeClientBRCWallet } from './myWalletImplementation' // client BRC-103 wallet

const clientWallet = new SomeClientBRCWallet('client-private-key-hex')

const socket = authIO('http://localhost:3000', {
  wallet: clientWallet,
  managerOptions: { transports: ['websocket'] }
})

socket.on('connect', () => {
  console.log('Client connected, ID:', socket.id)
  socket.emit('chatMessage', { text: 'Hello from client!' })
})

socket.on('chatMessage', (data) => {
  console.log('Received chatMessage from server:', data)
})
```

1. `authIO(...)` creates a BRC-103 transport, a `Peer`, and a client wrapper that mimics normal Socket.IO usage (`on`, `emit`, etc.).  
2. The handshake automatically happens behind the scenes the first time a message is sent or received.  

### Example Communication

Once the server is running on `localhost:3000`, and the client runs `clientApp.ts`, you see:

- **Server log**:
  ```
  Listening on port 3000
  New Authenticated Connection -> socket ID: ...
  Received chatMessage from client: { text: 'Hello from client!' }
  ```
- **Client log**:
  ```
  Client connected, ID: ...
  Received chatMessage from server: { from: "...", text: "Hello from client!" }
  ```

Both sides have effectively performed a BRC-103 handshake, verified messages, and re-dispatched them as normal events.

---

## Detailed Explanations

### AuthSocketServer & AuthSocket (Server)

- **`AuthSocketServer`**:  
  1. Wraps a normal `socket.io` server instance internally.  
  2. On each `connection`, it creates a `SocketServerTransport` and a **new** `Peer`.  
  3. It then constructs an `AuthSocket` for that connection, which re-dispatches `'general'` BRC-103 messages to `.on(eventName, callback)`.  
  4. Maintains a `Map` of connections (by `socket.id`) to track the `Peer`, `AuthSocket`, and discovered `identityKey`.  

- **`AuthSocket`**:  
  - Exposes `on(eventName, callback)` and `emit(eventName, data)` so developers can treat it like a normal `Socket.IO` socket object.  
  - Under the hood, calls `peer.toPeer(...)` to sign data, or decodes incoming data from `peer.listenForGeneralMessages(...)`.

### SocketServerTransport & SocketClientTransport

- Both implement the **BRC-103** `Transport` interface.  
- **Server side**: `SocketServerTransport` listens for `socket.on('authMessage')` from a **Socket.IO** server `IoSocket`.  
- **Client side**: `SocketClientTransport` listens for `socket.on('authMessage')` from a **Socket.IO** client `IoClientSocket`.  
- This means both sides exchange `AuthMessage` objects on a special `'authMessage'` event, enabling the `Peer` class to do its BRC-103 logic (handshake, signatures, certificate exchange, etc.).

### Client-Side AuthSocketClient (authIO function)

- The `authIO(...)` function wraps the **client** usage. Developers do:
  ```ts
  const socket = authIO('https://myserver.com', { wallet: myWallet })
  socket.on('connect', () => { ... })
  socket.emit('hello', { text: 'Hi' })
  ```
- That code internally:
  1. Creates a real `io(url, managerOptions)`.  
  2. Wraps it in a `SocketClientTransport`.  
  3. Creates a `Peer` with your local BRC-103 wallet.  
  4. Creates an `AuthSocketClient` (or similar) which re-dispatches inbound `'general'` messages and sends new ones with `.emit(...)`.  

The result is an **API** almost identical to standard `socket.io-client`, except everything is cryptographically authenticated.

---

## License

See LICENSE.md

---

### Final Thoughts

- **Both** server and client must follow the BRC-103 message flow for full authentication.  
- The `Peer` class manages ephemeral nonces, signatures, certificate requests, etc.  
- **No changes** to typical `.on(...)` / `.emit(...)` usage from a developer perspective—only **how** the messages are wrapped and verified is new.  

This solution ensures **mutual authentication** and secure messaging with minimal friction for developers accustomed to Socket.IO.