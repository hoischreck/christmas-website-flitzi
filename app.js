var express = require("express");
const { MyServer } = require("./server");

var inputAsync = require(__dirname + "/asyncInput.js");
var server = require(__dirname + "/server.js");

const MASTER_TOKEN = "admin";
const MASTER_ARG = "pw";
const PORT = process.env.PORT ? process.env.PORT : 3000;


console.log(PORT);
// todo: create classes and controlles for server tasks

var app = express();

var myServer = new server.MyServer(app);
var myCommands = new server.CommandManager(myServer);
myCommands.addCommand("addUser", server.addUserCommand);

//Data-instantiation finished
myServer.log("Data-instantiation finished");

// setup
app.set("view engine", "ejs");

// use middleware 
app.use(express.static(__dirname + "/assets"));


// set route handlers
app.get("/", (req, res) => {
    //console.log("Index.html requested by: " + req.ip);
    res.sendFile(__dirname + "/public_html/index.html");
})

// admin commands
app.get("/admin/:command", (req, res) => {
    var command = req.params.command;
    var args = req.query;
    var pw_entry = args[MASTER_ARG];
    if (!pw_entry || pw_entry != MASTER_TOKEN) {
        res.sendFile(__dirname + "/public_html/invalid_entry.html");
        return;
    }; // todo: add some sort of handling (invalid pw etc.) -> dynamic error page
    if (!myCommands.validCommand(command)) {
        console.log("invalid command")
        res.sendFile(__dirname + "/public_html/invalid_entry.html")
        return;
    };

    delete args[MASTER_ARG];

    var success = myCommands.runCommand(command, args);

    if (success) {
        console.log("success");
    } else {
        console.log("unsuccessful");
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