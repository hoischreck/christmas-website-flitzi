var express = require("express");
var fs = require("fs");
var inputAsync = require(__dirname + "/asyncInput.js");

const PORT = 3000;
const user_data_path = __dirname + "/data/user_data.json"

// todo: create classes and controlles for server tasks

function saveUsers(users) {
    fs.writeFileSync(user_data_path, JSON.stringify(users));
}

function readUsers() {
    let data = fs.readFileSync(user_data_path, "utf8")
    var users = data.length <= 0 ? {} : JSON.parse(data);
    return users;
}

function shutdownServer(save = true) {
    if (save) {
        saveUsers(users);
        console.log("[---Saved successfully before termination---]");
    } else {
        console.log("[---Termination without saving---]")
    }
    process.exit(0);
}

var UserInfo = function(name, code) {
    this.name = name;
    this.code = code;
}

var app = express();

var users = readUsers();

console.log("instantiation finished");

// setup
app.set("view engine", "ejs");

// use middleware 
app.use(express.static(__dirname + "/assets"));


// set route handlers
app.get("/", (req, res) => {
    console.log("Index.html requested by: " + req.ip);
    res.sendFile(__dirname + "/public_html/index.html");
})


// exit with saving by using signal interrupt
process.on("SIGINT", () => {
    shutdownServer();
})

// start server
app.listen(PORT);
console.log("Server is listening at port: " + PORT);

// ask for shutdown save async input
var saveBeforeShutdown = inputAsync.getYorN("Shutdown ([Y]es-save/[N]o-save)\n");
saveBeforeShutdown.then((state) => {shutdownServer(save=state)});
