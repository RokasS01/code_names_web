const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const rooms = {};
const history = {};

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('createRoom', ({ username }) => {
        const roomCode = uuidv4().slice(0, 6);
        rooms[roomCode] = [{ id: socket.id, username, isHost: true }];
        history[roomCode] = [`${username} a créé le salon.`];
        socket.join(roomCode);
        socket.emit('roomCreated', { code: roomCode, users: rooms[roomCode] });
        io.to(roomCode).emit('userList', rooms[roomCode]);
        io.to(roomCode).emit('historyUpdate', history[roomCode]);
    });

    socket.on('joinRoom', ({ code, username }) => {
        if (rooms[code]) {
            const userExists = rooms[code].some(user => user.username === username || user.id === socket.id);
            if (userExists) {
                socket.emit('error', 'Pseudo déjà pris ou vous êtes déjà dans le salon.');
                return;
            }
            rooms[code].push({ id: socket.id, username, isHost: false });
            history[code].push(`${username} a rejoint le salon.`);
            socket.join(code);
            socket.emit('roomJoined', { code, users: rooms[code] });
            io.to(code).emit('userList', rooms[code]);
            io.to(code).emit('historyUpdate', history[code]);
        } else {
            socket.emit('error', 'Salon introuvable');
        }
    });

    socket.on('leaveRoom', ({ code }) => {
        if (rooms[code]) {
            const userIndex = rooms[code].findIndex(user => user.id === socket.id);
            if (userIndex !== -1) {
                const user = rooms[code][userIndex];
                rooms[code].splice(userIndex, 1);
                socket.leave(code);
                history[code].push(`${user.username} a quitté le salon.`);
                if (rooms[code].length === 0 || user.isHost) {
                    delete rooms[code];
                    delete history[code];
                    io.to(code).emit('roomClosed');
                } else {
                    io.to(code).emit('userList', rooms[code]);
                    io.to(code).emit('historyUpdate', history[code]);
                }
            }
        }
    });

    socket.on('kickUser', ({ code, userId }) => {
        if (rooms[code]) {
            const host = rooms[code].find(user => user.isHost && user.id === socket.id);
            if (host) {
                const userIndex = rooms[code].findIndex(user => user.id === userId);
                if (userIndex !== -1) {
                    const user = rooms[code][userIndex];
                    rooms[code].splice(userIndex, 1);
                    io.to(user.id).emit('kicked');
                    history[code].push(`${user.username} a été viré du salon par l'hôte.`);
                    io.to(code).emit('userList', rooms[code]);
                    io.to(code).emit('historyUpdate', history[code]);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            const userIndex = rooms[roomCode].findIndex(user => user.id === socket.id);
            if (userIndex !== -1) {
                const user = rooms[roomCode][userIndex];
                rooms[roomCode].splice(userIndex, 1);
                history[roomCode].push(`${user.username} a été déconnecté.`);
                if (rooms[roomCode].length === 0 || user.isHost) {
                    delete rooms[roomCode];
                    delete history[roomCode];
                    io.to(roomCode).emit('roomClosed');
                } else {
                    io.to(roomCode).emit('userList', rooms[roomCode]);
                    io.to(roomCode).emit('historyUpdate', history[roomCode]);
                }
            }
        }
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
