require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

console.log("Database Simulation (RAM Mode) active.");

let players = {};
let drawnNumbers = [];
let gameState = "BETTING"; 
let totalJackpot = 0;

function generateLotto90Grid() {
    let grid = [
        Array(9).fill(null),
        Array(9).fill(null),
        Array(9).fill(null)
    ];

    for (let c = 0; c < 9; c++) {
        let min = c * 10 + 1;
        let max = (c === 8) ? 90 : (c + 1) * 10;
        let colNumbers = [];
        while (colNumbers.length < 3) {
            let n = Math.floor(Math.random() * (max - min + 1)) + min;
            if (!colNumbers.includes(n)) colNumbers.push(n);
        }
        colNumbers.sort((a, b) => a - b);
        for (let r = 0; r < 3; r++) {
            grid[r][c] = colNumbers[r];
        }
    }

    // TSINGANANA FAHA-44 VOAHITSY ARY VALIDE 100%:
    for (let r = 0; r < 3; r++) {
        let indices =0;1;2;3;4;5;6;7;8
        indices.sort(() => Math.random() - 0.5);
        let toRemove = indices.slice(0, 4);
        for (let idx of toRemove) {
            grid[r][idx] = "";
        }
    }
    return grid;
}

function checkWinner(grid, numbersDrawn) {
    let completedLines = 0;
    for (let row of grid) {
        let numbersInRow = row.filter(num => num !== "");
        if (numbersInRow.length === 0) continue;
        if (numbersInRow.every(num => numbersDrawn.includes(num))) completedLines++;
    }
    return completedLines >= 2; 
}

io.on('connection', (socket) => {
    socket.emit('game-info', { status: gameState, history: drawnNumbers, jackpot: totalJackpot });
    io.emit('update-players', Object.values(players).map(p => ({ pseudo: p.pseudo, phone: p.phone, balance: p.balance })));
    
    socket.on('demande-depot-admin', (data) => io.emit('recevoir-depot-admin', data));
    socket.on('demande-retrait-admin', (data) => io.emit('recevoir-retrait-admin', data));
    socket.on('maj-solde-force', (data) => {
        if(players[data.phone]) io.emit('maj-solde-joueur', { phone: data.phone, balance: players[data.phone].balance });
    });
});

app.post('/api/inscription', (req, res) => {
    const { pseudo, phone } = req.body;
    if (!pseudo || !phone || phone.length < 10) return res.status(400).json({ error: "Invalide" });
    if (!players[phone]) players[phone] = { pseudo, phone, balance: 0, cards: [] };
    io.emit('update-players', Object.values(players).map(p => ({ pseudo: p.pseudo, phone: p.phone, balance: p.balance })));
    res.json({ success: true, balance: players[phone].balance });
});

app.post('/api/depot', (req, res) => {
    const { phone, montant } = req.body;
    if (players[phone]) {
        players[phone].balance += parseInt(montant);
        return res.json({ success: true, balance: players[phone].balance });
    }
    res.status(404).json({ error: "Invalide" });
});

app.post('/api/acheter-carte', (req, res) => {
    const { phone, quantite } = req.body;
    const prixTotal = quantite * 200; 
    if (gameState !== "BETTING" || quantite > 6 || quantite < 1) return res.status(400).json({ error: "Erreur" });
    if (!players[phone] || players[phone].balance < prixTotal) return res.status(400).json({ error: "Solde insuffisant" });

    players[phone].balance -= prixTotal;
    totalJackpot += prixTotal;
    players[phone].cards = [];
    for(let i=0; i < quantite; i++) players[phone].cards.push(generateLotto90Grid());
    io.emit('update-jackpot', { jackpot: totalJackpot });
    res.json({ success: true, balance: players[phone].balance, cards: players[phone].cards });
});

app.post('/api/loto/tirage', (req, res) => {
    if (drawnNumbers.length >= 90) return res.json({ success: false });
    gameState = "PLAYING";
    let numAlea;
    do { numAlea = Math.floor(Math.random() * 90) + 1; } while (drawnNumbers.includes(numAlea));
    drawnNumbers.push(numAlea);
    io.emit('number-drawn', { number: numAlea, history: drawnNumbers });

    let winnerFound = null;
    for (let phone in players) {
        for (let grid of players[phone].cards) {
            if (checkWinner(grid, drawnNumbers)) { winnerFound = players[phone]; break; }
        }
        if (winnerFound) break;
    }
    if (winnerFound) {
        io.emit('game-over', { won: true, winner: winnerFound.pseudo, phone: winnerFound.phone, jackpot: totalJackpot });
        return res.json({ success: true, winner: winnerFound.pseudo });
    }
    res.json({ success: true, number: numAlea });
});

app.post('/api/admin/payer', (req, res) => {
    drawnNumbers = []; totalJackpot = 0; gameState = "BETTING";
    for(let p in players) players[p].cards = [];
    io.emit('game-reset', { message: "Miverina manao pari indray!" });
    res.json({ success: true });
});

server.listen(3000, () => console.log("Serveur Lotto90 running on port 3000"));
