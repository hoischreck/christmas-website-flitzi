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

exports.getYorN = async function (iString) {
    var userInput = await exports.getPrompt(iString);
    userInput = userInput.toUpperCase();
    if (userInput === "Y") {
        return true;
    }
    else if (userInput === "N") {
        return false;
    }
    else {
        return exports.getYorN(iString);
    }
}
