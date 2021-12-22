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
        //player.inLobby = true; 
        //todo: MUST BE UNCOMMETED (only for dev purposes)

        // send data to all clients
        lobby.sendAll({
            type: "joinedLobby",
            code: lobby.code,
            players: lobby.players,
            lobbySize: lobby.size(),
            readyCount: lobby.readyCount()
        })
            
        return true;
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
                    } else {
                        
                    }
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
        this.players.push(player); 
        return true;
    }

    readyPlayer(playerName, state=true) {
        for (let i in this.players) {
            let p = this.players[i];
            if (p.name == playerName) {
                p.ready = state;
                return;
            }
        }
    }

    removePlayer(player) {
        this.players.splice(this.players.indexOf(player), 1);
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

    sendAll(dataObj, excludePlyName=null) {
        let data = JSON.stringify(dataObj);
        console.log("sending to: " + this.size())
        for (let p in this.players) {
            let player = this.players[p];
            console.log("1 sending to: " + player.name)
            if (excludePlyName !== null && player.name == excludePlyName) {
                continue;
            }
            console.log("2 sending to: " + player.name)
            player.socket.send(data);
        }
    }
}

class MauMauGame {
    constructor(playerLobby) {
        this.lobby = playerLobby;
    }

    play() {

    }
}