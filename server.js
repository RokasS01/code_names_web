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
        rooms[roomCode] = {
            users: [{ id: socket.id, username, isHost: true }],
            teams: { red: [], blue: [], unassigned: [{ id: socket.id, username, isHost: true }] }
        };
        history[roomCode] = [`${username} a créé le salon.`];
        socket.join(roomCode);
        socket.emit('roomCreated', { code: roomCode, users: rooms[roomCode].users });
        io.to(roomCode).emit('userList', rooms[roomCode].users);
        io.to(roomCode).emit('historyUpdate', history[roomCode]);
        io.to(roomCode).emit('updateTeams', rooms[roomCode].teams);
    });

    socket.on('joinRoom', ({ code, username }) => {
        if (rooms[code]) {
            const userExists = rooms[code].users.some(user => user.username === username || user.id === socket.id);
            if (userExists) {
                socket.emit('error', 'Pseudo déjà pris ou vous êtes déjà dans le salon.');
                return;
            }
            const newUser = { id: socket.id, username, isHost: false };
            rooms[code].users.push(newUser);
            rooms[code].teams.unassigned.push(newUser);
            history[code].push(`${username} a rejoint le salon.`);
            socket.join(code);
            socket.emit('roomJoined', { code, users: rooms[code].users });
            io.to(code).emit('userList', rooms[code].users);
            io.to(code).emit('historyUpdate', history[code]);
            io.to(code).emit('updateTeams', rooms[code].teams);
        } else {
            socket.emit('error', 'Salon introuvable');
        }
    });

    socket.on('leaveRoom', ({ code }) => {
        if (rooms[code]) {
            const userIndex = rooms[code].users.findIndex(user => user.id === socket.id);
            if (userIndex !== -1) {
                const user = rooms[code].users[userIndex];
                rooms[code].users.splice(userIndex, 1);
                ['red', 'blue', 'unassigned'].forEach(team => {
                    const teamIndex = rooms[code].teams[team].findIndex(member => member.id === socket.id);
                    if (teamIndex !== -1) rooms[code].teams[team].splice(teamIndex, 1);
                });
                socket.leave(code);
                history[code].push(`${user.username} a quitté le salon.`);
                if (rooms[code].users.length === 0 || user.isHost) {
                    delete rooms[code];
                    delete history[code];
                    io.to(code).emit('roomClosed');
                } else {
                    io.to(code).emit('userList', rooms[code].users);
                    io.to(code).emit('historyUpdate', history[code]);
                    io.to(code).emit('updateTeams', rooms[code].teams);
                }
            }
        }
    });

    socket.on('kickUser', ({ code, userId }) => {
        if (rooms[code]) {
            const host = rooms[code].users.find(user => user.isHost && user.id === socket.id);
            if (host) {
                const userIndex = rooms[code].users.findIndex(user => user.id === userId);
                if (userIndex !== -1) {
                    const user = rooms[code].users[userIndex];
                    rooms[code].users.splice(userIndex, 1);
                    ['red', 'blue', 'unassigned'].forEach(team => {
                        const teamIndex = rooms[code].teams[team].findIndex(member => member.id === userId);
                        if (teamIndex !== -1) rooms[code].teams[team].splice(teamIndex, 1);
                    });
                    io.to(user.id).emit('kicked');
                    history[code].push(`${user.username} a été viré du salon par l'hôte.`);
                    io.to(code).emit('userList', rooms[code].users);
                    io.to(code).emit('historyUpdate', history[code]);
                    io.to(code).emit('updateTeams', rooms[code].teams);
                }
            }
        }
    });

    socket.on('joinTeam', ({ code, team }) => {
        if (rooms[code]) {
            const userIndex = rooms[code].users.findIndex(user => user.id === socket.id);
            if (userIndex !== -1) {
                const user = rooms[code].users[userIndex];
                ['red', 'blue', 'unassigned'].forEach(t => {
                    const teamIndex = rooms[code].teams[t].findIndex(member => member.id === socket.id);
                    if (teamIndex !== -1) rooms[code].teams[t].splice(teamIndex, 1);
                });
                rooms[code].teams[team].push(user);
                io.to(code).emit('updateTeams', rooms[code].teams);
            }
        }
    });

    socket.on('startGame', ({ code }) => {
        if (rooms[code]) {
            const host = rooms[code].users.find(user => user.isHost && user.id === socket.id);
            if (host) {
                io.to(code).emit('gameStarted');
                history[code].push('La partie a commencé.');
                io.to(code).emit('historyUpdate', history[code]);
            }
        }
    });

    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            const userIndex = rooms[roomCode].users.findIndex(user => user.id === socket.id);
            if (userIndex !== -1) {
                const user = rooms[roomCode].users[userIndex];
                rooms[roomCode].users.splice(userIndex, 1);
                ['red', 'blue', 'unassigned'].forEach(team => {
                    const teamIndex = rooms[roomCode].teams[team].findIndex(member => member.id === socket.id);
                    if (teamIndex !== -1) rooms[roomCode].teams[team].splice(teamIndex, 1);
                });
                history[roomCode].push(`${user.username} a été déconnecté.`);
                if (rooms[roomCode].users.length === 0 || user.isHost) {
                    delete rooms[roomCode];
                    delete history[roomCode];
                    io.to(roomCode).emit('roomClosed');
                } else {
                    io.to(roomCode).emit('userList', rooms[roomCode].users);
                    io.to(roomCode).emit('historyUpdate', history[roomCode]);
                    io.to(roomCode).emit('updateTeams', rooms[roomCode].teams);
                }
            }
        }
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
