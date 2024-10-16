const express = require('express')
const http = require('http')
const socketIo = require('socket.io')

const app = express()

const server = http.createServer(app)

const io = socketIo(server)

app.get('/', (req, res) => {
  res.sendFile(__dirname, 'index.html')
})

io.on('connection', (socket) => {
  console.log('connnected chat')
  socket.broadcast.emit('chat message', 'A user has joined the chat')

  socket.on('chat message', (msg) => {
    io.emit('chat message', msg)
  })

  socket.on('disconnect', () => {
    console.log('user chat')
    socket.broadcast.emit('chat message', 'A user has left the chat')
  })
})

server.listen(3000, () => {
  console.log('server connected')
})
