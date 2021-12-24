const { MyServer } = require("./server");
const fs = require("fs");
const { range } = require("express/lib/request");
const { all } = require("express/lib/application");

const cardDir = __dirname + "/assets/img/cards";

exports.Manager = class MauMauLobbyManager {
    static mustWin = 5;

    constructor(myServer) {
        this.myServer = myServer;
        this.lobbies = {};
        this.connectedPlayers = {};
    }
    
    addLobby(code) {
        if (!(code in this.lobbies)) {
            this.lobbies[code] = new Lobby(code, this);
            return true;
        } else {
            return false;
            //throw Error("Lobby-Code already exists");
        }
    }

    removeLobby(code) {
        if (!this.lobbies.hasOwnProperty(code)) return false;
        let lobby = this.lobbies[code];
        for (let p in lobby.players) {
            this.leaveLobby(lobby.players[p].name, code);
        }
        delete this.lobbies[code];
        return true;
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

    // special method for myServer
    addWin(playerName) {
        this.myServer.users[playerName].additionalPresentData[1].wonGames += 1;
        this.myServer._updateData();
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

                case "updateWinCounter":
                    let totalWins = this.myServer.users[data.playerName].additionalPresentData[1].wonGames;
                    socket.send(JSON.stringify({
                        type: "setWinCounter",
                        wins: totalWins
                    }))
                    if (totalWins >= MauMauLobbyManager.mustWin) {
                        socket.send(JSON.stringify({
                            type: "unlockPresent"
                        }))
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
        this.game.end();
    }

    endGame() {
        console.log("officially ending game");
        this.game.end(); 
        // toggle ready is done by client
        delete this.game;
        this.updateClientLobbies();
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
        let playerNames = [];
        for (let i in this.players) {
            playerNames.push(this.players[i].name);
        }
        this.sendAll({
            type: "updateLobby",
            code: this.code,
            players: playerNames,
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
    static drawConstant = 2; //drawing 2 cards per 7
    static cardBackSideFile = "blue.png"

    constructor(playerLobby) {
        this.lobby = playerLobby;
        this._instructions;
        this._addInstructions();
    }

    gameInstructions(game) {
        game._instructions = function onMessage(rawData) {
            var data = JSON.parse(rawData.toString());
            switch (data.type) {
                case "playCard":
                    if (!game.validatePlayTurn(data.playerName, data.playedCard, data.upperCard)) return; //invalid turn action request
                    game.rankOverride = null;
                    game.updatedPlayedCard(data.playedCard);
                    game.updateAllPlayers();
                    if(!game.checkIfWon()) {
                        game.chooseNextTurn(data.playedCard);
                    } else {
                        let winner = game.turnPlayer;
                        console.log(winner.name + " has won the game");
                        game.lobby.sendAll({
                            type: "gameLost"
                        }, winner.name)
                        winner.socket.send(JSON.stringify({
                            type: "gameWon"
                        }))
                        // save win to myServer
                        game.lobby.lobbyManager.addWin(winner.name);
                        game.lobby.endGame();
                    }
                    break;
                
                case "drawCard":
                    if (!game.validateCardDraw(data.playerName)) return;
                    game.updateDrawCard();
                    game.startedDrawing = true; // conter is not allowed
                    game.updateAllPlayers();
                    console.log("draws remaining after: " + game.drawsLeft)
                    if (game.drawsLeft < 1) {
                        game.startedDrawing = false;
                        game.forceDraw = false;
                        game.notifyNextTurn();
                    } else {
                        console.log("nochmal")
                        game.notifyNextTurn(false);
                    }
                     // calls same player again
                    break;

                case "rankOverride":
                    if (!game.validateRankOverride(data.playerName)) return;
                    console.log("valid override");
                    game.updateRankOverride(data.newCardRank);
                    game.updateAllPlayers();
                    game.awaitingRankOverride = false;
                    game.notifyNextTurn();
                    break;
            }
        }
        return game._instructions;
    }

    updateRankOverride(newRank) {
        this.rankOverride = newRank;
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
    }

    checkIfWon() {
        //todo: change to < 1
        return (this.turnPlayer.cards.length < 1) ? true : false;
    }

    chooseNextTurn(playedCard) {
        // apply special card effects if any
        if (playedCard.value == "jack") {
            // notify player to wish next symbol
            this.awaitingRankOverride = true;
            this.notifyNextTurn(false, "chooseNewRank");
        } else if (playedCard.value == "7") {
            // notfiy next player to draw cards
            if (this.drawsLeft == 1 && !this.startedDrawing) {
                this.drawsLeft = MauMauGame.drawConstant;
            } else {
                this.drawsLeft += MauMauGame.drawConstant;
            }
            
            this.forceDraw = true;
            this.updateAllPlayers();
            this.notifyNextTurn(true, "forceDraw", false);
        } else if (playedCard.value == "ace") {
            this.notifyNextTurn(false, null, false, true);
        } else {
            // next players turn
            this.notifyNextTurn();
        }
        //todo: apply effects
    }

    updateDrawCard() {
        //todo: when no cards left shuffle
        this.turnPlayer.cards.push(this._randomPop(this.deckCards));
        console.log("draws before: " + this.drawsLeft)
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
        console.log("init new game");
        this.deckCards = [];
        this.playedCards = [];
        this.upperCard = null;
        this.rankOverride = null;
        this.awaitingRankOverride = false;
        this.forceDraw = false;
        this.startedDrawing = false;
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

    notifyNextTurn(nextPlayer=true, specialAction=null, resetDraws=true, forceDrawReset=false) {
        if (nextPlayer) {
            if (this.currenPlayerIndx < this.activePlayers.length-1) {
                this.currenPlayerIndx++;
            } else {
                this.currenPlayerIndx = 0;
            }
            this.turnPlayer = this.activePlayers[this.currenPlayerIndx];
            if (resetDraws) this.drawsLeft = 1;
        }

        //todo: dirty solution (but no time)
        if (forceDrawReset) this.drawsLeft = 1;

        this.turnPlayer.socket.send(JSON.stringify({
            type: "playerTurn",
            drawsLeft: this.drawsLeft,
            additional: specialAction // e.g. must draw when playing a 7 or whising a certain rank
        }))
    }

    // player turn must be validated and compared with server side
    validatePlayTurn(playerName, playerCard, upperCard) {
        if (this.turnPlayer.name != playerName) return false; 
        if (this.awaitingRankOverride) return;
        if (this.upperCard === null && upperCard !== null) return false;
        if (this.upperCard !== null) {
            console.log(this.upperCard);
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
        if (this.rankOverride !== null) {
            if (this.rankOverride != playerCard.rank && playerCard.value != "jack") return false;
        } else {
            if (this.upperCard !== null && this.upperCard.rank != playerCard.rank && this.upperCard.value != playerCard.value && playerCard.value != "jack") return false;
        }
        if (this.startedDrawing) return false;
        if (this.forceDraw) {
            if (playerCard.value != "7") return false;
        }

        return true;
    }

    validateCardDraw(playerName) {
        if (this.turnPlayer.name != playerName) return false; 
        if (this.awaitingRankOverride) return;
        if (this.drawsLeft < 1) {
            return false;
        };
        return true;
    }

    validateRankOverride(playerName) {
        if (this.turnPlayer.name != playerName) return false;
        if (!this.awaitingRankOverride) return false;
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
                rankOverride: this.rankOverride,
                forceDraw: this.forceDraw, 
                drawsLeft: this.drawsLeft,
                startedDrawing: this.startedDrawing
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
            console.log("trying to remove listener");
            this.lobby.players[p].socket.removeListener("message", this._instructions);
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