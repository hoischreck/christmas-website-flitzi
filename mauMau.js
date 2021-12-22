const { MyServer } = require("./server");

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

    play() {
        console.log("GAME OF MAU MAU has started");
    }

    end() {
        this._removeInstructions();
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