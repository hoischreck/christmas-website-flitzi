const { rejects } = require("assert");
const exp = require("constants");
const { resolve } = require("path/posix");
var readline = require("readline");
const { is } = require("type-is");

exports.getPrompt = function (iString) {
    let r1 = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve, reject) => {
        r1.question(iString, (answer) => {
            r1.close();
            resolve(answer);
        })
    })
}

exports.getYorN = function (iString) {
    var i = exports.getPrompt(iString);
    i.then((userInput) => {
        userInput = userInput.toUpperCase();
        if (userInput === "Y") {
            return new Promise((resolve, rejects) => {
                return resolve(true);
            });
        }
        else if (userInput === "N") {
            return new Promise((resolve, rejects) => {
                return resolve(false);
            });
        }
        else {
            return exports.getYorN(iString);
        }
    }) 
}