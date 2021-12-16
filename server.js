const { throws } = require("assert");
var fs = require("fs");

// todo: user data should not be saved on GitHub

exports.UserData = function UserData(code, codeUsed = false) {
    this.code = code;
    this.codeUsed = codeUsed;
}

exports.MyServer = class MyServer {
    static USER_DATA_PATH = __dirname + "/data/user_data.json";
    static SERVER_MSG_LOG_PREFIX = "[SERVER]: ";
    static SERVER_WARNING_LOG_PREFIX = "![SERVER-Warning]: ";
    static SERVER_ERR_LOG_PREFIX = "!![SERVER-Error]: ";

    constructor(app) {
        this.app = app;
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

    // User control

    addUser(name, userInfoObject) {
        this.users[name] = userInfoObject;
    }
    
    saveUsers() {
        fs.writeFileSync(MyServer.USER_DATA_PATH, JSON.stringify(this.users, null, "\t"));
    }

    addUserUpdate(name, userInfoObject) {
        this.addUser(name, userInfoObject);
        this.saveUsers();
        this.users = this._readUsers();
    }

    _readUsers() {
        let data = fs.readFileSync(MyServer.USER_DATA_PATH, "utf8")
        var users = data.length <= 0 ? {} : JSON.parse(data);
        return users;
    }

}

class CommandArgs {
    constructor() {
        this.name = name;
    }
}

//todo: add error handling
//todo: add general help functionaltiy
exports.CommandManager = class CommandManager {
    constructor(server) {
        this.server = server;
        this.commands = {};
    };

    addCommand(callString, commandFunction) {
        this.commands[callString] = commandFunction;
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

//todo: general command class

function argValidator(argObj, ...args) {
    for (i in args) {
        if (!(args[i] in argObj)) {
            return false
        };
    }
    return true;
}

// Update-Command instantly change changes, but data must be reloaded

exports.addUserCommand = function addUserCommand(server, args) {
    var validArgs = argValidator(args, "name", "code");
    if (!validArgs) return false;
    
    server.addUser(args.name, new exports.UserData(args.code));

    return true;
}

exports.addUserCommandUpt = function addUserCommandUpt(server, args) {
    var validArgs = argValidator(args, "name", "code");
    if (!validArgs) return false;
    
    server.addUserUpdate(args.name, new exports.UserData(args.code));

    return true;
}