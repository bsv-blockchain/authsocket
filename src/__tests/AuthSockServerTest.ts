import { createServer } from 'http'
import { AuthSocketServer } from '../AuthSocketServer'
import { ProtoWallet } from '../../wallet'
import { PrivateKey } from '../../primitives'

import * as crypto from 'crypto'
import { authIO } from '../clients/AuthSocketClient'
global.self = { crypto }

const httpServer = createServer()
const port = 3000

const serverWallet = new ProtoWallet(PrivateKey.fromRandom())
const io = new AuthSocketServer(httpServer, {
  wallet: serverWallet
})

// Typical usage:
io.on('connection', (socket) => {
  console.log('A user connected with socket ID', socket.id)

  // Let's listen for a chatMessage
  socket.on('chatMessage', (msg) => {
    console.log('Message from client:', msg)
    // broadcast to all clients:
    io.emit('chatMessage', {
      from: socket.id,
      text: `Hello, client!`
    })
  })

  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`)
  })
})

httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})


// CLIENT SIDE TEST
// 1. Create client-side wallet
const clientWallet = new ProtoWallet(PrivateKey.fromRandom())

// 2. Connect to the server with the newly created wallet
const socket = authIO('http://localhost:3000', {
  wallet: clientWallet
})

// 3. Socket event listeners
socket.on('connect', () => {
  console.log('Connected to server with socket ID:', socket.id)
})

socket.on('disconnect', () => {
  console.log('Disconnected from server')
})

socket.on('chatMessage', (msg) => {
  console.log('Received chatMessage from server:', msg)
  socket.emit('chatMessage', {
    text: 'Hello again server!'
  })
  socket.disconnect()
})

// 4. Emit a test message
socket.emit('chatMessage', {
  text: 'Hello server! - from client'
})