const { throws } = require("assert");
var fs = require("fs");
var bcrypt = require("bcrypt");
var webSocket = require("ws");

// todo: user data should not be saved on GitHub

exports.hashPw = function hashPw(password) {
    return bcrypt.hashSync(password, 10);
}

exports.checkPw = function checkPw(pw, encrypted) {
    return bcrypt.compareSync(pw, encrypted);
}

exports.User = function User(name, userDataObj) {
    this.name = name;
    this.info = userDataObj
} 

// different format would be better, but change would be to dangerous       
exports.UserData = function UserData(password) {
    this.password = exports.hashPw(password);
    this.presentCodes = {
        1: "gift1",
        2: "gift2",
        3: "gift3",
    }
    this.unlockedGifts = {
        1: false,
        2: false,
        3: false
    }
    this.additionalPresentData = {
        1: {

        },
        2: {

        },
        3: {
            challenges: {
                finished: {
                    1: false,
                    2: false,
                    3: false,
                    4: false,
                    5: false,
                    6: false
                }
            }
        },
    }

}

exports.MyServer = class MyServer {
    static USER_DATA_PATH = __dirname + "/data/user_data.json";
    static SERVER_MSG_LOG_PREFIX = "[SERVER]: ";
    static SERVER_WARNING_LOG_PREFIX = "[!SERVER-Warning]: ";
    static SERVER_ERR_LOG_PREFIX = "[!!SERVER-Error]: ";
    static PRESENT_COUNT = 3;

    constructor(app) {
        this.app = app;
        this.server = require("http").createServer(app);
        this.wss = new webSocket.Server({ server: this.server });
        this.clients = {};
        
        this.users = this._readUsers();
    }

    // Server control
    // todo: maybe outsource and split into server controllers

    log(message, type="message") {
        var prefix = MyServer.SERVER_MSG_LOG_PREFIX;
        switch(type) {
            case "warning":
                prefix = MyServer.SERVER_WARNING_LOG_PREFIX;
                break;
            case "error":
                prefix = MyServer.SERVER_ERR_LOG_PREFIX;
                break;
        }
        console.log(prefix + message);
    }
    
    shutdown(save = true) {
        if (save) {
            this.saveUsers();
            console.log("[-!-] Saved successfully before termination [-!-]");
        } else {
            console.log("[-!-] Termination without saving [-!-]")
        }
        process.exit(0);
    }

    // app control
    
    addAppControl(controler) {
        controler(this.app);
        //todo: use a list of active controllers, also for server controllers?
    }

    listen(port, msg=true) {
        this.server.listen(port, () => {
            if (msg) {
                this.log("Listening on port: " + port);
            }
        });
    }

    addClient(identifier, socket, forceNew = false) {
        if (forceNew) {
            if (this.clients.hasOwnProperty(identifier)) {
                // closes an existing websocket connection
                this.closeClient(identifier);
            }
        }
        this.clients[identifier] = socket;
    }

    closeClient(identifier) {
        if (!this.clients.hasOwnProperty(identifier)) return;
        this.clients[identifier].close();
        delete this.clients[identifier];
    }
  
    getClient(identifier) {
        if (this.clients.hasOwnProperty(identifier)) {
            return this.clients[identifier];
        } else {
            throw new Error(`Client '${identifier}' does not exist`);
        }
    }

    clientCount() {
        return Object.keys(this.clients).length;
    }

    // User control

    addUser(name, userInfoObject) {
        this.users[name] = userInfoObject;
    }
    
    saveUsers() {
        fs.writeFileSync(MyServer.USER_DATA_PATH, JSON.stringify(this.users, null, "\t"));
    }

    deleteUserUpdate(name) {
        this._updateData;
        delete this.users[name];
        this._updateData();
    }

    addUserUpdate(name, userInfoObject) {
        this.addUser(name, userInfoObject);
        this._updateData();
    }

    verifyUser(name, pw) {
        if (name in this.users && exports.checkPw(pw, this.users[name].password)) {
            return true;
        }
        return false;
    }

    setPresentCodes(name, ...codes) {
        for (i = 1; i < MyServer.PRESENT_COUNT + 1; i++) {
            this.users[name].presentCodes[i] = codes[i-1];
        }
        this._updateData(); 
        
    }

    unlockPresent(name, presentId) {
        this.users[name].unlockedGifts[presentId] = true;
        this._updateData();
    }

    lockPresent(name, presentId) {
        this.users[name].unlockedGifts[presentId] = false;
        this._updateData();
    }

    getUserObj(name) {
        return new exports.User(name, this.users[name]);
    }

    _readUsers() {
        let data = fs.readFileSync(MyServer.USER_DATA_PATH, "utf8")
        var users = data.length <= 0 ? {} : JSON.parse(data);
        return users;
    }

    _updateData() {
        this.saveUsers();
        this.users = this._readUsers();
    }

}

// ADMIN - API

//todo: add error handling -> e.g. delete entry doesnt exist, etc.
//todo: add general help functionaltiy
exports.CommandManager = class CommandManager {
    constructor(server, addHelpCommand=true) {
        this.server = server;
        this.commands = {};
        if (addHelpCommand) {
            this.addCommand("help", exports.helpCommand, true);
        }
    };

    addCommand(callString, commandFunction, addCManager=false) {
        if (addCManager) {
            this.commands[callString] = commandFunction(this);
        } else {
            this.commands[callString] = commandFunction;
        }
    }

    deleteCommand(callString) {
        delete this.commands[callString];
    }

    runCommand(callString, args) {
        return this.commands[callString](this.server, args);
    }

    validCommand(callString) {
        return Object.keys(this.commands).includes(callString);
    }
}

function argValidator(desiredArgObj, argList) {
    for (i in argList) {
        if (!(argList[i] in desiredArgObj)) {
            return false
        };
    }
    return true;
}

// Update-Command instantly change changes, but data must be reloaded

exports.command = (func, ...desiredArgs) => {
    function run(server, args) {
        var validArgs = argValidator(args, desiredArgs);
        if (!validArgs) return {
            success: false,
            missing_args: desiredArgs
        };
        var res = func(server, args);
        if (res.completed === true) {
            return {
                success: true,
                result: res.result
            }
        } else {
            return {
                success: false,
                result: res.result
            }
        }
    }
    return run;
}

// this function is not not needed if server input cannot be made
exports.helpCommand = (commandManager) => {
    var command = exports.command((server, args) => {
        var rString = "";
        for (command in commandManager.commands) {
            rString += `(${command}) `;
        }
        return {
            completed: true,
            result: rString 
        }
    })
    return command;
}


exports.addUserCommandTmp = exports.command((server, args) => { 
    server.addUser(args.name, new exports.UserData(args.password));
    return {
        completed: true,
        result: `Added User (temporarily): ${args.name}`
    };
}, "name", "password")


exports.addUserCommand = exports.command((server, args) => {
    server.addUserUpdate(args.name, new exports.UserData(args.password));
    return {
        completed: true,
        result: `Added User: ${args.name} (pw: ${args.password})`
    };
}, "name", "password")

exports.deleteUserCommand = exports.command((server, args) => {   
    server.deleteUserUpdate(args.name);
    return {
        completed: true,
        result: `Deleted User: ${args.name}`
    };
}, "name")

exports.saveUsersCommand = exports.command((server, args) => {
    server.saveUsers();
    return {
        completed: true,
        result: `Saved all user data`
    };
})

exports.setPresentCodesCommand = exports.command((server, args) => {
    server.setPresentCodes(args.name, args.code1, args.code2, args.code3);
    return {
        completed: true,
        result: `Set present codes for: ${args.name} (code 1: ${args.code1}) (code 2: ${args.code2}) (code 3: ${args.code3})`
    };
}, "name", "code1", "code2", "code3")

exports.unlockPresentCommand = exports.command((server, args) => {
    server.unlockPresent(args.name, args.present);
    return {
        completed: true,
        result: `Unlocked present ${args.present} for user ${args.name}`
    };
}, "name", "present")

exports.lockPresentCommand = exports.command((server, args) => {
    server.lockPresent(args.name, args.present);
    return {
        completed: true,
        result: `Locked present ${args.present} for user ${args.name}`
    };
}, "name", "present")

// client commands

exports.getActiveClients = exports.command((server, args) => {
    var clients = server.clients;
    var rString = "";
    var i = 1;
    for (user in clients) {
        rString += `(${i}: ${user})`;
        i++;
    }
    return {
        completed: true,
        result: `Clients(${server.clientCount()}): ` + rString
    }
})
