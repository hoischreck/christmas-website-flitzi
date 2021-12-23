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
        if (playerName in this.connectedPlayers) {
            this.removeOnlinePlayer(playerName);
        } // closes existing sockets
        this.connectedPlayers[playerName] = new Player(playerName, socket);
        this._addMessageHandler(playerName);
    }

    removeOnlinePlayer(playerName) {
        let player = this.connectedPlayers[playerName];
        if (player.inLobby) {
            console.log("player leaving with code:" + player.joinedLobbyCode)
            this.leaveLobby(playerName, player.joinedLobbyCode);
        }
        // player.socket.send(JSON.stringify({
        //     type: "terminatingConnection",
        //     reason: "Only 1 continuous connection allowed"
        // }))
        //player.socket.close(); //already done by unload
    }

    joinLobby(playerName, lobbyCode) {
        if (!this.lobbies.hasOwnProperty(lobbyCode)) return false; // code doesnt exist
        let lobby = this.lobbies[lobbyCode];
        let player = this.connectedPlayers[playerName];
        if (!lobby.addPlayer(player)) return false; // lobby was already full
        player.inLobby = true; 
        player.joinedLobbyCode = lobbyCode;
        console.log("player joined: " + player.name)
        // send data to all clients
        lobby.updateClientLobbies();
        return true;
    }

    leaveLobby(playerName, lobbyCode) {
        console.log("code: " + lobbyCode)
        let player = this.connectedPlayers[playerName];
        if (!player.inLobby) return false; // player is in no lobby
        let lobby = this.lobbies[lobbyCode];
        lobby.removePlayer(playerName);
        player.inLobby = false; 
        player.joinedLobbyCode = null;
        player.ready = false;

        let wasInGame = this.leaveGame(playerName, lobbyCode);
        console.log("successfully left game")
        console.log("ready: " + player.ready);
        // dont update lobby when players were in a game
        if (!wasInGame) {
            lobby.updateClientLobbies();
        }
        
        player.socket.send(JSON.stringify({
            type: "leftLobby"
        }))
    }

    leaveGame(playerName, lobbyCode) {
        let lobby = this.lobbies[lobbyCode];
        if (lobby.game === undefined) return false;
        lobby.playerDisconnect(playerName);
        return true;
    }

    playerReadyState(playerName, lobbyCode, state=true) {
        let lobby = this.lobbies[lobbyCode];
        if (!lobby.readyPlayer(playerName, state)) return false; // player is in no lobby
        console.log("toggling ready state")
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
                    console.log("leaving lobby: " + data.lobby);
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
        this.joinedLobbyCode = null;
        this.ready = false;
    }
}

class Lobby {
    static lobbySize = 2;

    constructor(code, lobbyManager) {
        this.code = code;
        this.lobbyManager = lobbyManager;
        this.players = [];
        this.game;
    }

    addPlayer(player) {
        if (this.isFull()) {
            //throw Error("Lobby only supports a maximum of " + Lobby.lobbySize + "players");
            return false;
        } 
        for (let i in this.players) {
            // maybe outsource into manager
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

    removePlayer(playerName) {
        // todo: remove by name
        for (let i in this.players) {
            if (this.players[i].name == playerName) {
                this.players.splice(i, 1);
                console.log("could remove")
                return true;
            }
        }
        return false;
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

    playerDisconnect(playerName) {
        this.game.terminatePlayer(playerName);
        this.endGame();
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
        //console.log(dataObj)
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

// allow drawing in the beginning?
class MauMauGame {
    static cardsPerPlayer = 6;
    static cardBackSideFile = "blue.png"

    constructor(playerLobby) {
        this.lobby = playerLobby;
        this._addInstructions();
    }

    gameInstructions(game) {
        function onMessage(rawData) {
            var data = JSON.parse(rawData.toString());
            switch (data.type) {
                case "playCard":
                    if (!game.validatePlayTurn(data.playerName, data.playedCard, data.upperCard)) return; //invalid turn action request
                    game.updatedPlayedCard(data.playedCard);
                    game.updateAllPlayers();
                    // for test purposes
                    game.notifyNextTurn();

                    console.log("cards and turn are valid");
                    break;
                
                case "drawCard":
                    if (!game.validateCardDraw(data.playerName)) return;
                    game.updateDrawCard();
                    game.updateAllPlayers();
                    if (game.drawsLeft < 1) {
                        game.notifyNextTurn();
                    } else {
                        game.notifyNextTurn(false);
                    }
                     // calls same player again
                    break;
            }
        }
        return onMessage;
    }

    updatedPlayedCard(playedCard) {
        // update playing field and player
        this.playedCards.push(playedCard);
        this.upperCard = playedCard;
        for (let c in this.turnPlayer.cards) {
            if (this.turnPlayer.cards[c].path == playedCard.path) {
                this.turnPlayer.cards.splice(c, 1);
                break;
            } 
        }
        // apply special card effects if any
        if (playedCard.value == "jack") {
            // notify player to wish next symbol
            console.log("jack has been played")
            return;
        } else if (playedCard.value == "7") {
            // notfiy next player to draw cards
            console.log("7 has been played")
            return;
        } else {
            console.log("a normal turn")
            // next players turn
        }
        //todo: apply effects
    }

    updateDrawCard() {
        //todo: when no cards left shuffle
        this.turnPlayer.cards.push(this._randomPop(this.deckCards));
        this.drawsLeft--;
        if (this.deckCards.length < 1) {
            this.deckCards = this._shuffle(this.playedCards.slice(0, -1));
            this.playedCards = [];
            this.playedCards.push(this.upperCard);
        }
    }

    //todo: test this
    start() {
        // init all cards (set also possible)
        this.deckCards = [];
        this.playedCards = [];
        this.upperCard = null;
        fs.readdirSync(cardDir).forEach(file => {
            if (file == MauMauGame.cardBackSideFile) return;
            this.deckCards.push(new Card("/img/cards/" + file));
        })
        // set cards of players
        for (let p in this.lobby.players) {
            let player = this.lobby.players[p];
            player.cards = [];
            for (let i = 0; i < MauMauGame.cardsPerPlayer; i++) {
                player.cards.push(this._randomPop(this.deckCards));
            }
        }

        this.updateAllPlayers();

        this.play();
    }

    play() {
        // generate random player order
        this.activePlayers = this._shuffle(this.lobby.players);
        this.turnPlayer = null;
        this.currenPlayerIndx = 0;

        this.notifyNextTurn();
    }

    nextPlyIndx(index) {
        if (index < this.activePlayers.length - 1) {
            index++;
            return index;
        } else {
            return 0;
        }
    }

    notifyNextTurn(nextPlayer=true, specialAction=null) {
        if (nextPlayer) {
            if (this.currenPlayerIndx < this.activePlayers.length-1) {
                this.currenPlayerIndx++;
            } else {
                this.currenPlayerIndx = 0;
            }
            this.turnPlayer = this.activePlayers[this.currenPlayerIndx];
            this.drawsLeft = 1;
        }

        this.turnPlayer.socket.send(JSON.stringify({
            type: "playerTurn",
            drawsLeft: this.drawsLeft,
            additional: specialAction // e.g. must draw when playing a 7 or whising a certain rank
        }))
    }

    // player turn must be validated and compared with server side
    validatePlayTurn(playerName, playerCard, upperCard) {
        if (this.turnPlayer.name != playerName) return false; 
        if (this.upperCard === null && upperCard !== null) return false;
        if (this.upperCard !== null) {
            if (this.upperCard.path != upperCard.path) return false;
        }
        let hasCard = false;
        for (let c in this.turnPlayer.cards) {
            if (this.turnPlayer.cards[c].path == playerCard.path) {
                hasCard = true;
                break;
            }
        }
        if (!hasCard) return false;
        return true;
    }

    validateCardDraw(playerName) {
        if (this.turnPlayer.name != playerName) return false; 
        if (this.drawsLeft < 1) {
            return false;
        };
        return true;
    }

    terminatePlayer(playerName) {
        //disconnectedPlayer
        console.log("terminating player")
        this.lobby.sendAll({
            type: "playerDisconnected"
        }, playerName)
    }

    end() {
        this._removeInstructions();
        //todo: remove card information
    }

    updateAllPlayers() {
        let players = this.lobby.players;
        for (let p in players) {
            let player = players[p];

            let enemyCards = {};
            for (let e in players) {
                let enemy = players[e];
                if (enemy == player) continue;
                enemyCards[enemy.name] = enemy.cards.length;
            }
            
            player.socket.send(JSON.stringify({
                type: "updateCardView",
                playerCards: player.cards,
                remainingInDeck: this.amountInDeck(),
                upperCard: this.upperCard,
                enemyCardAmount: enemyCards,
            }))

        }
    }

    amountInDeck() {
        return this.deckCards.length;
    }

    _randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    _randomPop(array) {
        let i = Math.floor(Math.random() * array.length);
        let item = array[i];
        array.splice(i, 1);
        return item;
    }

    _shuffle(array) {
        let arrayCopy = [];
        for (let i in array) arrayCopy.push(array[i]);
        let newArray = [];
        let j = arrayCopy.length;
        for (let i = 0; i < j; i++) {
            newArray.push(this._randomPop(arrayCopy));
        }
        return newArray;
    }

    _addInstructions() {
        for (let p in this.lobby.players) {
            this.lobby.players[p].socket.on("message", this.gameInstructions(this));
        }
    }

    _removeInstructions() {
        for (let p in this.lobby.players) {
            this.lobby.players[p].socket.removeListener("message", this.gameInstructions(this));
        }
    }
}

class Card {
    constructor(path) {
        this.path = path;
        this.value = path.split("_").at(-1).split(".")[0];
        this.rank = path.split("/").at(-1).split("_")[0];
    }
}