var express = require("express");
var fs = require("fs");
var inputAsync = require(__dirname + "/asyncInput.js");

const PORT = 3000;
const user_data_path = __dirname + "/data/user_data.json"

function saveUsers(users) {
    fs.writeFileSync(user_data_path, JSON.stringify(users));
}

function readUsers() {
    let data = fs.readFileSync(user_data_path, "utf8")
    var users = data.length <= 0 ? {} : JSON.parse(data);
    return users;
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

process.on("SIGINT", () => {
    saveUsers(users);
    console.log("Saved successfully before termination");
    process.exit(0);
})

// start server
app.listen(PORT);
console.log("Server is listening at port: " + PORT);

var saveBeforeShutdown = inputAsync.getYorN("Do you want to save before shutting down the server (Y/N)");
saveBeforeShutdown.then((state) => {
    console.log(state);
})

// var test = inputAsync.getPrompt("test frage");
// test.then((answer) => {
//     console.log("Testeingabe: " + answer);
// })
