var express = require("express");

var PORT = 3000;

var app = express();

app.set("view engine", "ejs");
//app.use("/", express.static("assets"));
app.use(express.static(__dirname + "/assets"));


app.get("/", (req, res) => {
    //console.log("Index.html requested by: " + req.ip);
    res.sendFile(__dirname + "/public_html/index.html");
})

app.listen(PORT);
console.log("Server is listening at port: " + PORT);