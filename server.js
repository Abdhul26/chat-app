const express = require('express')
const http = require('http')
const socketIo = require('socket.io')
const path = require('path')
const bcrypt = require('bcrypt')
const multer = require('multer')

const app = express()
const server = http.createServer(app)
const io = socketIo(server)

const messages = []
const userPasswords = {}
const onlineUsers = new Set()

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/') // Ensure this directory exists
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)) // Append timestamp to the filename
  },
})

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpg|jpeg|png|pdf/
  const extName = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  )
  const mimetype = allowedTypes.test(file.mimetype)

  if (extName && mimetype) {
    return cb(null, true)
  }
  cb('Error: File type not allowed!') // Return an error for unsupported file types
}

const upload = multer({
  storage: storage,
  limits: { fileSize: 1000000 }, // Limit file size to 1MB
  fileFilter: fileFilter,
})

app.use(express.static(path.join(__dirname, 'public')))

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html')
})

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.')
  }

  // Emit the file information to all clients
  io.emit('file uploaded', {
    username: req.body.username,
    filename: req.file.filename,
    originalname: req.file.originalname,
    timestamp: new Date().toLocaleTimeString(),
  })

  res.send(`File uploaded successfully: ${req.file.filename}`)
})

app.post('/upload', upload.single('file'), (req, res) => {
  const filePath = `http://localhost:3000/${req.file.path}`
  io.emit('file message', { username: req.body.username, filePath })
  res.sendStatus(200)
})

io.on('connection', (socket) => {
  console.log('connected chat')
  socket.broadcast.emit('chat message', 'A user has joined the chat')

  // Registration handler
  socket.on('register', (username, password) => {
    if (userPasswords[username]) {
      socket.emit('registration error', 'Username already exists')
    } else {
      const hashedPassword = bcrypt.hashSync(password, 10)
      userPasswords[username] = hashedPassword // Store hashed password
      socket.emit('registration success', 'User registered successfully')
    }
  })

  socket.on('file message', (data) => {
    const li = document.createElement('li')
    li.innerHTML = `${data.username} sent a file: <a href="${data.filePath}" target="_blank">View File</a>`
    document.getElementById('messages').appendChild(li)
  })

  // Login handler
  socket.on('login', (username, password) => {
    const hashedPassword = userPasswords[username]
    if (hashedPassword && bcrypt.compareSync(password, hashedPassword)) {
      socket.username = username // Store username in socket instance
      onlineUsers.add(username) // Add user to the online users Set
      socket.emit('login success', `Welcome ${username}!`)
      socket.broadcast.emit('user connected', username) // Notify others
      io.emit('update users', Array.from(onlineUsers)) // Update user list for everyone
    } else {
      socket.emit('login error', 'Invalid username or password')
    }
  })

  socket.on('chat message', (message) => {
    const timestamp = new Date().toLocaleTimeString()
    const chatMessage = {
      username: socket.username,
      message: message,
      timestamp: timestamp,
    }
    messages.push(chatMessage)
    io.emit('chat message', chatMessage)
  })

  socket.on('join room', (room) => {
    socket.join(room)
    socket.emit('chat message', {
      username: 'System',
      message: `You joined room: ${room}`,
    })
    socket.to(room).emit('chat message', {
      username: 'System',
      message: `${socket.username} joined the room`,
    })
  })

  socket.on('typing', (username) => {
    console.log(`${username} is typing...`)
    socket.broadcast.emit('typing', username)
  })

  socket.on('stop typing', (username) => {
    console.log(`${username} stopped typing...`)
    socket.broadcast.emit('stop typing', username)
  })

  socket.on('disconnect', () => {
    console.log('user chat')
    if (socket.username) {
      onlineUsers.delete(socket.username) // Remove user from online users Set
      socket.broadcast.emit('chat message', 'A user has left the chat')
      io.emit('update users', Array.from(onlineUsers)) // Update user list for everyone
    }
  })
})

server.listen(3000, () => {
  console.log('server connected')
})
