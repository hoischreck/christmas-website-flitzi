var express = require("express");
const { MyServer, addUserCommandUpt } = require("./server");

var inputAsync = require(__dirname + "/asyncInput.js");
var server = require(__dirname + "/server.js");

const MASTER_TOKEN = "admin";
const MASTER_ARG = "pw";

const PORT = process.env.PORT ? process.env.PORT : 3000;

// todo: create classes and controlles for server tasks

var app = express();

var myServer = new server.MyServer(app);
var myCommands = new server.CommandManager(myServer);

//myCommands.addCommand("addUser", server.addUserCommand);
myCommands.addCommand("addUser", server.addUserCommand);
myCommands.addCommand("addUserTmp", server.addUserCommandTmp);
myCommands.addCommand("saveUsers", server.saveUsersCommand);
myCommands.addCommand("deleteUser", server.deleteUserCommand);


//Data-instantiation finished
myServer.log("Data-instantiation finished");

// setup
app.set("view engine", "ejs");

// use middleware 
app.use(express.static(__dirname + "/assets"));


// set route handlers
app.get("/", (req, res) => {
    //console.log("Index.html requested by: " + req.ip);
    var args = {};
    res.render("index", args);
})

// admin commands
app.get("/admin/:command", (req, res) => {
    var command = req.params.command;
    var args = req.query;
    var pw_entry = args[MASTER_ARG];
    delete args[MASTER_ARG];
    var argObj = {
        command: command,
        password: pw_entry,
        arguments: args,
        password_arg: MASTER_ARG
    }

    if (!myCommands.validCommand(command)) {
        argObj.message = "Command does not exist";
        res.render("invalid_entry", argObj);
        return;
    };
    if (!pw_entry || pw_entry != MASTER_TOKEN) {
        argObj.message = "Password is insufficient";
        res.render("invalid_entry", argObj);
        return;
    }; // todo: add some sort of handling (invalid pw etc.) -> dynamic error page

    // catch errors and display them
    try {
    var result = myCommands.runCommand(command, args);
    if (result.success) {
        argObj.message = "Command executed successfully";
        res.render("valid_entry", argObj);
    } else {
        argObj.message = "[Command failed] Arguments needed: ";
        for (i in result.missing_args) {
            argObj.message += `>${result.missing_args[i]} `;
        }
        res.render("invalid_entry", argObj);
    }

    } catch (e) {
        myServer.log("erorr " + e);
        argObj.message = "Fatal Error has been thrown:\n\n" + e;
        res.render("invalid_entry", argObj);
    }

    

    res.destroy(null); // todo: valid solution?
    //myCommands.runCommand(command, {})

})

// exit with saving by using signal interrupt
process.on("SIGINT", () => {
    server.shutdown();
})

// start server
app.listen(PORT);
myServer.log("Listening on port: " + PORT);

// ask for shutdown save async input
var saveBeforeShutdown = inputAsync.getYorN("Shutdown ([Y]es-save/[N]o-save)\n");
saveBeforeShutdown.then((state) => {myServer.shutdown(save=state)});

myServer.addUser("ivo", new server.UserData(1337));