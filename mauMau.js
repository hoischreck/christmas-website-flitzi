const { MyServer } = require("./server");
const fs = require("fs");
const { range } = require("express/lib/request");
const { all } = require("express/lib/application");

const cardDir = __dirname + "/assets/img/cards";

exports.Manager = class MauMauLobbyManager {
    constructor() {
        this.lobbies = {};
        this.connectedPlayers = {};
    }
    
    addLobby(code) {
        if (!(code in this.lobbies)) {
            this.lobbies[code] = new Lobby(code);
            return true;
        } else {
            return false;
            //throw Error("Lobby-Code already exists");
        }
    }

    addOnlinePlayer(playerName, socket) {
        this.connectedPlayers[playerName] = new Player(playerName, socket);
        this._addMessageHandler(playerName);
    }

    joinLobby(playerName, lobbyCode) {
        if (!this.lobbies.hasOwnProperty(lobbyCode)) return false; // code doesnt exist
        let lobby = this.lobbies[lobbyCode];
        let player = this.connectedPlayers[playerName];
        if (!lobby.addPlayer(player)) return false; // lobby was already full
        player.inLobby = true; 
        //todo: MUST BE UNCOMMETED (only for dev purposes)
        console.log("player joined: " + player.name)
        // send data to all clients
        lobby.updateClientLobbies();
        return true;
    }

    leaveLobby(playerName, lobbyCode) {
        let player = this.connectedPlayers[playerName];
        if (!player.inLobby) return false; // player is in no lobby
        let lobby = this.lobbies[lobbyCode];
        lobby.removePlayer(player);
        player.inLobby = false; 
        lobby.updateClientLobbies();
        player.socket.send(JSON.stringify({
            type: "leftLobby"
        }))   
        console.log("left lobby")
    }

    playerReadyState(playerName, lobbyCode, state=true) {
        let lobby = this.lobbies[lobbyCode];
        if (!lobby.readyPlayer(playerName, state)) return false; // player is in no lobby
        lobby.updateClientLobbies();
        lobby.checkGameStart();
    }

    _addMessageHandler(playerName) {
        let socket = this.connectedPlayers[playerName].socket;
        socket.on("message", (rawData) => {
            var data = JSON.parse(rawData.toString());
            switch (data.type) {
                case "newLobby":
                    if (!this.addLobby(data.code)) {
                        socket.send(JSON.stringify({
                            type: "codeAlreadyExists"
                        }))
                    } else {
                        socket.send(JSON.stringify({
                            type: "addedLobby"
                        }))
                    }
                    break;

                case "joinLobby":
                    if (!this.joinLobby(data.playerName, data.lobbyCode)) {
                        socket.send(JSON.stringify({
                            type: "couldNotJoin" // invalid code or user somehow already in lobby
                        }))
                    } else {}
                    break;

                case "leaveLobby":
                    this.leaveLobby(data.name, data.lobby);
                    break;

                case "readyPlayer":
                    this.playerReadyState(data.name, data.lobby, true);
                    break;

                case "unreadyPlayer":
                    this.playerReadyState(data.name, data.lobby, false);
                    break;
            }
        })  
    }
    
    _allSearchingPlayers() {
        let searching = {};
        for (let player in this.connectedPlayers) {
            if (this.connectedPlayers[player].searching === true) {
                searching[player] = this.connectedPlayers[player];
            }
        }
        return searching;
    }
    


    // _updateSearchInfo() {
    //     let sPlayers = this._allSearchingPlayers();
    //     let playerNames = Object.keys(sPlayers);
    //     for (let player in sPlayers) {
    //         let data = {
    //             type: "updatePlayerSearch",
    //             //searchingPlayers: playerNames.filter(p => p != player) todo: commented for debugging purposes
    //             searchingPlayers: playerNames

    //         }
    //         sPlayers[player].socket.send(JSON.stringify(data));
    //     }
    // }
 
}

class Player {
    constructor(name, socket) {
        this.name = name;
        this.socket = socket;
        this.inLobby = false;
        this.ready = false;
    }
}

class Lobby {
    static lobbySize = 2;

    constructor(code) {
        this.code = code;
        this.players = [];
    }

    addPlayer(player) {
        if (this.isFull()) {
            //throw Error("Lobby only supports a maximum of " + Lobby.lobbySize + "players");
            return false;
        } 
        for (let i in this.players) {
            if (this.players[i].name == player.name) return false; // prevents joining with same account twice
        }
        this.players.push(player); 
        return true;
    }

    readyPlayer(playerName, newState=true) {
        for (let i in this.players) {
            let p = this.players[i];
            if (p.name == playerName) {
                p.ready = newState;
                return true;
            }
        }
        return false;
    }

    removePlayer(player) {
        this.players.splice(this.players.indexOf(player), 1);
    }

    checkGameStart() {
        if (this.readyCount() < Lobby.lobbySize) return;
        this.startNewGame();
    } 

    startNewGame() {
        this.game = new MauMauGame(this);
        this.sendAll({
            type: "gameStart"
        })
        // start game
        this.game.start();
    }

    endGame() {
        this.game.end();
    }

    isFull() {
        return (this.players.length >= Lobby.lobbySize)
    }

    size() {
        return this.players.length;
    }

    readyCount() {
        let c = 0;
        for (let i in this.players) {
            if (this.players[i].ready) {
                c++;
            }
        }
        return c;
    }

    updateClientLobbies() {
        this.sendAll({
            type: "updateLobby",
            code: this.code,
            players: this.players,
            lobbySize: this.size(),
            readyCount: this.readyCount()
        })
    }

    sendAll(dataObj, excludePlyName=null) {
        let data = JSON.stringify(dataObj);
        for (let p in this.players) {
            let player = this.players[p];
            if (excludePlyName !== null && player.name == excludePlyName) {
                continue;
            }
            player.socket.send(data);
        }
    }
}

class MauMauGame {
    static cardsPerPlayer = 6;

    constructor(playerLobby) {
        this.lobby = playerLobby;
        this._addInstructions();
    }

    gameInstructions(rawData) {
        var data = JSON.parse(rawData.toString());
        switch (data.type) {
            case "":
                break;
        }
    }

    //todo: test this
    start() {
        // init all cards (set also possible)
        this.allCards = [];
        fs.readdirSync(cardDir).forEach(file => {
            this.allCards.push(new Card("/img/cards/" + file));
        })
        
        // set cards of players
        for (let p in this.lobby.players) {
            let player = this.lobby.players[p];
            player.cards = [];
            for (let i in range(MauMauGame.cardsPerPlayer)) {
                player.cards.push(this._popRandomCard());
            }
            console.log(JSON.stringify(player.cards))
        }
        console.log(this.allCards.length)


        this.updateAllPlayers();

        //this.play();
    }

    play() {
        console.log("GAME OF MAU MAU has started");
    }

    end() {
        this._removeInstructions();
        //todo: remove card information
    }

    updateAllPlayers() {
        let players = this.lobby.players;
        for (let p in players) {
            let player = players[p];

            player.socket.send(JSON.stringify({
                type: "udpdateCardView",
                cards: player.cards
            }))

        }
    }

    _popRandomCard() {
        //todo: what if length 0
        let i = Math.floor(Math.random()*this.allCards.length);
        let card = this.allCards[i];
        this.allCards.splice(i, 1);
        return card;
    }

    _addInstructions() {
        for (let p in this.lobby.players) {
            this.lobby.players[p].socket.on("message", this.gameInstructions);
        }
    }

    _removeInstructions() {
        for (let p in this.lobby.players) {
            this.lobby.players[p].socket.removeListener("message", this.gameInstructions);
        }
    }
}

class Card {
    constructor(path) {
        this.path = path;
        this.value = path.split("_").at(-1).split(".")[0];
    }
}