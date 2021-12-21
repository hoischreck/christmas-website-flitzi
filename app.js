var express = require("express");
var bodyParser = require("body-parser");
var session = require("express-session");

const { MyServer, addUserCommandUpt } = require("./server");
const { json } = require("body-parser");
const { WebSocketServer } = require("ws");

var inputAsync = require(__dirname + "/asyncInput.js");
var server = require(__dirname + "/server.js");

// constants

const MASTER_TOKEN = "admin";
const MASTER_ARG = "pw";

const GIFT_NUM_ARG = "giftNumber"; //todo: place this here?

const PORT = process.env.PORT ? process.env.PORT : 3000;

// app instantiation

// todo: create classes and controlles for server tasks

var app = express();

var myServer = new server.MyServer(app);
var myCommands = new server.CommandManager(myServer);

var urlencodedParser = bodyParser.urlencoded({extended: false})

// adding admin commands (api)

myCommands.addCommand("addUser", server.addUserCommand);
myCommands.addCommand("addUserTmp", server.addUserCommandTmp);
myCommands.addCommand("saveUsers", server.saveUsersCommand);
myCommands.addCommand("deleteUser", server.deleteUserCommand);
myCommands.addCommand("setPresentCodes", server.setPresentCodesCommand);
myCommands.addCommand("unlockPresent", server.unlockPresentCommand);
myCommands.addCommand("lockPresent", server.lockPresentCommand);

//Data-instantiation finished
myServer.log("Data-instantiation finished");

// setup
app.set("view engine", "ejs");

// use middleware 
app.use(express.static(__dirname + "/assets"));
app.use(session({
    secret: "env variable", //todo: add real secret key
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day till expiration
    }
}))

// handle auth check

function authLogin(req, res) {
    if (!req.session.authenticated) {
        res.redirect("/login");
        return false;
    }
    return true;
}

// set route handlers
app.get("/", (req, res) => {
    //console.log("Index.html requested by: " + req.ip);
    if (!authLogin(req, res)) return;

    res.render("index", {user: req.session.user});
    
})


// login setup

app.get("/login", (req, res) => {
    var validLogin = req.query.validLogin;
    res.render("login", {validLogin});
})

app.post("/login", urlencodedParser, (req, res) => {
    var validAuth = myServer.verifyUser(req.body.name, req.body.password);

    if (validAuth) {
        req.session.authenticated = true;
        var name = req.body.name;
        req.session.user = myServer.getUserObj(name);
        res.redirect("/");
    } else {
        res.redirect("/login?validLogin=false"); //add error message
    }
    //todo: add user
})

// gift routes

function authGiftUnlock(req, res, giftNumber) {
    if (!req.session.user.info.unlockedGifts[giftNumber]) {
        res.redirect(`/unlock?${GIFT_NUM_ARG}=${giftNumber}`);
        return false;
    }
    return true;
}

app.get("/gift1", (req, res) => {
    //console.log("Index.html requested by: " + req.ip);
    if (!authLogin(req, res)) return;
    if (!authGiftUnlock(req, res, 1)) return;

    var args = {};
    res.render("gift1_game");

})

app.get("/gift2", (req, res) => {
    //console.log("Index.html requested by: " + req.ip);
    if (!authLogin(req, res)) return;
    if (!authGiftUnlock(req, res, 2)) return;

    var args = {};
    res.render("gift2_picture");

})

app.get("/gift3", (req, res) => {
    //console.log("Index.html requested by: " + req.ip);
    if (!authLogin(req, res)) return;
    if (!authGiftUnlock(req, res, 3)) return;

    var args = {};
    res.render("gift3_book");

})

// unlock gifts 
app.get("/unlock", (req, res) => {
    if (!authLogin(req, res)) return;

    var giftNum = req.query[GIFT_NUM_ARG];
    var validCode = req.query["validCode"]; //todo: outsource ?
    if (!giftNum || giftNum < 1 || giftNum > 3) { // todo: git count may be outsourced
        res.redirect("/");
        return;
    }
    res.render("unlock", { giftNum , validCode });
})

app.post("/unlock", urlencodedParser, (req, res) => {
    var giftNumber = req.query[GIFT_NUM_ARG];
    var user = req.session.user;
    if (user.info.presentCodes[giftNumber] == req.body.code) {
        myServer.unlockPresent(user.name, giftNumber)
        req.session.user = myServer.getUserObj(user.name);
        res.redirect(`/gift${giftNumber}`)

    } else {
        res.redirect(`/unlock?${GIFT_NUM_ARG}=${giftNumber}&validCode=false`) //todo: add messaging
    }
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
        //todo: commands that change user attributes dont update sessions
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
        myServer.log(e, type="error");
        argObj.message = "Fatal Error has been thrown:\n\n" + e;
        res.render("invalid_entry", argObj);
    }

    

    //res.destroy(null); // todo: valid solution? <= call does not occur anymore
    //myCommands.runCommand(command, {})

})

// exit with saving by using signal interrupt
process.on("SIGINT", () => {
    server.shutdown();
})

// configure webSocket
var wss = myServer.wss;

wss.on("connection", (socket) => {
    myServer.log("new client has connected: " + socket);
    socket.on("message", (data) => {
        myServer.log("received: " + data + " - from: " + socket);
    })
})

// start server
myServer.listen(PORT);

// ask for shutdown save (async input)
var saveBeforeShutdown = inputAsync.getYorN("Shutdown ([Y]es-save/[N]o-save)\n");
saveBeforeShutdown.then((state) => {myServer.shutdown(save=state)});