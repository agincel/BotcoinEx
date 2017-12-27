const Promise = require("bluebird");
const yahoo = require("yahoo-finance");
Promise.promisifyAll(yahoo);

const Discord = require("discord.js");
const client = new Discord.Client();

const TelegramBot = require('node-telegram-bot-api');
const userData = require("./user");

const fs = require("fs");

var telegramToken = fs.readFileSync("telegramToken.txt", "utf8");
telegramToken = telegramToken.replace("\n", "");
const bot = new TelegramBot(telegramToken, {polling: true});

const startDate = new Date(); //use to ignore all old messages


function getSymbol(sym) {
    var map = {
        "BTC": "BTC-USD",
        "GOLD": "XAUUSD=X",
        "ETH": "ETH-USD",
        "LTC": "LTC-USD"
    }
    if (map[sym] !== undefined)
        return map[sym];
    else 
        return sym;
}

async function stockQuote(sym) {
    try {
        var quote = await yahoo.quote({symbol: sym, modules: ['price']});
    } catch (e) {
        return 0;
    }
    if (quote.price.currency == "USD")
        var ret = {price: quote.price.regularMarketPrice, name: quote.price.shortName};
    else
        return 0;
    console.log(ret);
    return ret;
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

async function genericSendMessage(text, platform, parameters) {
    if (platform == "telegram") {
        var ret = await bot.sendMessage(parameters.chatId, text, {parse_mode: "Markdown"});
        return ret;
    } else {
        var ret = await parameters.msg.channel.send(text);
        return ret;
    }
}

async function genericEditMessage(text, platform, parameters, msg) {
    if (platform == "telegram") {
        return await bot.editMessageText(text, {chat_id: parameters.chatId, message_id: msg.message_id, parse_mode: "Markdown"});
    } else {
        return await msg.edit(text);
    }
}

async function handleMessage(text, platform, platformObject, args, IDs) {

    if (args[0].indexOf("@") > -1) {
        args[0] = args[0].split("@")[0]; //change /buy@BotCoinExBot to /buy
    }

    async function sendMessage (text) {
        return await genericSendMessage(text, platform, platformObject);
    }
    async function editMessage(text, msg) {
        return await genericEditMessage(text, platform, platformObject, msg);
    }

    var user = await userData.getUserByName(IDs.discord, IDs.telegram);
    if (user != null) { //ALL FUNCTIONS YOU NEED TO HAVE AN ACCOUNT FOR
        // /buy - /buy SYMBOL X
        if (args[0] == "/buy") {
            let noBuy = false;
            if (args.length >= 3) { //check if no buy
                let sym = args[1];
                sym = getSymbol(sym.toUpperCase());
                if (!user.other || !user.other.buys || !user.other.buys[sym]) {
                    return await sendMessage("First, type `/buy " + args[1] + "` to lock in a price.");
                }
            }

            if (args.length == 1) { //buy
                return await sendMessage("Usage: /buy SYMBOL");
            } else if (args.length == 2 || noBuy) { //buy SYM
                //first, quote the stock. If found, other.buys.symbol = {date: now, price: number}
                var sym = args[1];
                sym = getSymbol(sym.toUpperCase());
                var resultMessage = await sendMessage("Quoting " + sym + " for purchase price...");

                console.log(sym);
                var quote = await stockQuote(sym);
                if (quote.price !== undefined) {
                    if (user.other.buys == undefined)
                        user.other.buys = {};
                    user.other.buys[sym] = {date: new Date(), price: quote.price};
                    await userData.updateUser(user._id, false, false, false, false, false, false, user.other);
                    return await editMessage(quote.name + " `[" + sym + "]` currently costs $" + quote.price + " per share.\nYou have $" + user.cash + ".\nYou now have 60 seconds to buy at that quoted price by typing \n`/buy " + args[1] + " X`\nWhere X is the amount of USD you want to invest.\n\n(Price does not need to be even multiples of quoted price -- if stock costs $1000 you can buy 0.5 shares for $500)", resultMessage);
                } else {
                    return await editMessage(sym + " not found.", resultMessage);
                }
            } else if (args.length >= 3) { //buy SYM AMT
                var sym = args[1];
                sym = getSymbol(sym.toUpperCase());
                var buying = 0;
                try {
                    buying = parseFloat(args[2]);
                    if (buying < 0)
                        buying *= -1;
                    if (buying > user.cash) {
                        buying = user.cash;
                    }
                    if (buying < 1) {
                        buying = 0;
                    }
                    if (user.cash < 1) {
                        return await sendMessage("You have no more cash to invest.");
                    }
                } catch (e) {
                    return await sendMessage("Please ask for a numerical quantity of shares. (Error parsing X)");
                }

                var sharePrice = user.other.buys[sym].price;
                if (buying > 0 && buying != NaN && new Date().getTime() - user.other.buys[sym].date.getTime() <= 60000) { // if it has been longer than sixty seconds
                    //valid trade
                    if (!user.portfolio) 
                        user.portfolio = {};
                    if (!user.portfolio[sym])
                        user.portfolio[sym] = 0;
                    let shareQuantity = buying / user.other.buys[sym].price;
                    user.portfolio[sym] += shareQuantity;

                    user.cash -= buying;
                    user.cash = parseFloat(user.cash.toFixed(2)); //round
                    shareQuantity = +shareQuantity.toFixed(4);
                    user.other.buys[sym] = undefined;
                    await userData.updateUser(user._id, false, false, false, user.cash, user.portfolio, false, user.other);

                    let sharesOwned = +user.portfolio[sym].toFixed(4);
                    
                    return await sendMessage(user.displayName + " has successfully bought " + shareQuantity + " shares of " + sym + " for $" + buying + ".\n\nThey now own " + sharesOwned + " shares total and $" + user.cash + " in their wallet.");
                } else if (buying == 0 || buying == NaN) {
                    return await sendMessage("Please buy at least $1 worth of " + sym + ".");
                } else {
                    return await sendMessage("Too slow. Use `/buy " + args[1] + "` to get a new quote");
                }
            }
        }

        if (args[0] == "/sell") {
            let noSell = false;
            if (args.length >= 3) { //check if no buy
                let sym = args[1];
                sym = getSymbol(sym.toUpperCase());
                if (!user.other || !user.other.sells || !user.other.sells[sym])
                    noSell = true;
            }

            if (args.length == 1) { //sell
                return await sendMessage("Usage: /sell SYMBOL");
            } else if (args.length == 2 || noSell) { //sell SYM
                //first, quote the stock. If found, other.sells.symbol = {date: now, price: number}
                var sym = args[1];
                sym = getSymbol(sym.toUpperCase());
                var resultMessage = await sendMessage("Quoting " + sym + " for sale price...");

                console.log(sym);
                let hasStock = false;
                if (user.portfolio) {
                    let syms = Object.keys(user.portfolio);
                    for (var i = 0; i < syms.length; i++) {
                        if (syms[i] == sym)
                            hasStock = true;
                    }
                }
                var quote = null;
                if (hasStock)
                    quote = await stockQuote(sym);
                if (hasStock && quote.price !== undefined) {
                    if (user.other.sells == undefined)
                        user.other.sells = {};
                    user.other.sells[sym] = {date: new Date(), price: quote.price};
                    await userData.updateUser(user._id, false, false, false, false, false, false, user.other);
                    return await editMessage(quote.name + " `[" + sym + "]` is currently valued at $" + quote.price + " per share.\nYou own " + user.portfolio[sym] + " shares.\nYou now have 60 seconds to sell at that quoted price by typing \n`/sell " + args[1] + " X`\nWhere X is the quantity of shares you want to sell.\n\n(You can sell fractions of a share -- ie 0.25 shares)", resultMessage);
                } else if (!hasStock) {
                    return await editMessage(sym + " not found in your portfolio.", resultMessage);
                } else {
                    return await editMessage(sym + " not found.", resultMessage);
                }
            } else if (args.length >= 3) { //sell SYM AMT
                var sym = args[1];
                sym = getSymbol(sym.toUpperCase());
                var selling = 0;
                try {
                    selling = parseFloat(args[2]);
                    if (selling < 0)
                        selling *= -1;
                    if (selling > user.portfolio[sym]) {
                        selling = user.portfolio[sym];
                    }
                    if (selling == NaN)
                        selling = 0;
                } catch (e) {
                    return await sendMessage("Please ask for a numerical quantity of shares. (Error parsing X)");
                }

                var sharePrice = user.other.sells[sym].price;
                if (selling > 0 && new Date().getTime() - user.other.sells[sym].date.getTime() <= 60000) { // if it has been longer than sixty seconds
                    //valid trade
                    
                    let moneyGained = selling * sharePrice;
                    user.portfolio[sym] -= selling;
                    let sharesOwned = +user.portfolio[sym].toFixed(4);
                    user.cash += moneyGained;
                    user.cash = parseFloat(user.cash.toFixed(2)); //you get rounded down, yeah

                    await userData.updateUser(user._id, false, false, false, user.cash, user.portfolio, false, false);
                    selling = +selling.toFixed(4);
                    return await sendMessage(user.displayName + " has successfully sold " + selling + " shares of " + sym + ", making $" + moneyGained.toFixed(2) + ".\n\nThey now own " + sharesOwned + " shares and have $" + user.cash + " in their wallet.");
                } else if (selling == 0) {
                    return await sendMessage("Please sell greater than 0 shares of " + sym + ". (An error may have occurred)");
                } else {
                    return await sendMessage("Too slow. Use `/sell " + args[1] + "` to get a new quote");
                }
            }
        }

        if (args[0] == "/portfolio") {
            if (user.portfolio || Object.keys(user.portfolio).length == 0) {
                let resultMessage = await sendMessage("Quoting portfolio (this may take a second)...");
                let prices = {};
                let syms = Object.keys(user.portfolio);
                for (var i = 0; i < syms.length; i++) {
                    if (user.portfolio[syms[i]] > 0) {
                        let quote = await stockQuote(syms[i]);
                        prices[syms[i]] = quote.price;
                    } else {
                        prices[syms[i]] = 0; //0 out if you don't have any of it, saves on computation time
                    }
                }

                var str = user.displayName + "'s Portfolio: \n";
                var totalValue = parseFloat(user.cash);
                for (var i = 0; i < syms.length; i++) {
                    let sharesOwned = +user.portfolio[syms[i]].toFixed(4);
                    if (sharesOwned > 0) {
                        let totalStockValue = user.portfolio[syms[i]] * prices[syms[i]];
                        console.log(syms[i] + " " + user.portfolio[syms[i]] + " " + prices[syms[i]]);
                        if (totalStockValue != NaN)
                            totalValue += totalStockValue;
                        str += syms[i] + ": " + sharesOwned + " shares at $" + prices[syms[i]] + " | $" + totalStockValue.toFixed(2) + "\n";
                    }
                }
                str += "\nCash: $" + user.cash + "\n----------------------\n";
                console.log(totalValue);

                str += "\n*TOTAL*: $" + totalValue.toFixed(2);
                return await editMessage(str, resultMessage);
            } else {
                return await sendMessage("User has no investments.");
            }
        }

        // /getusers - print all users, mostly debug
        if (args[0] == "/getusers") {
            try {
                let users = await userData.getAllUsers();
                let str = "";
                console.log("users:");
                console.log(users);
                for (var i = 0; i < users.length; i++) {
                    str += users[i].displayName + " | Cash: $" + users[i].cash + "\n";
                }
                return await sendMessage(str);
            } catch (e) {
                return await sendMessage(e.message);
            }
        }

        if (args[0] == "/debug") {
            console.log(typeof(user.discordUser));
            console.log(typeof(user.telegramUser));
            return await sendMessage(user.displayName + " | " + user.discordUser + " | " + user.telegramUser + " | " + user.cash);
        }

        if (args[0] == "/help") {
            let str = "Welcome to BotCoin Exchange!\n";
            str += "In this game you buy and sell ficticious shares of real companies and financial instruments. The bot uses Yahoo Finance, so if there's anything on Yahoo Finance that operates in USD, it's fair game.\n\n";
            str += "Use `/buy` to buy stock.\n";
            str += "Use `/sell` to sell shares from your portfolio.\n";
            str += "Use `/portfolio` to get the current value of your portfolio!\n";
            str += "Use `/quote` to learn the price of any symbol you're curious about.\n";
            str += "Use `/ping` to check that the bot is still online.\n";
            str += "Use `/inherit` to learn how to link your Telegram and Discord accounts to the same portfolio.\n"
            str += "Good luck!";

            return await sendMessage(str);
        }

        // /exit - type to exit the game
        if (args[0] == "/exit") {
            if (args.length > 1 && args[1] == "confirm") {
                try {
                    let getUser = await userData.getUserByName(IDs.discord, IDs.telegram);
                    userData.removeUser(getUser._id);
                    sendMessage("Removed user.");
                } catch (e) {
                    sendMessage("Remove failed.");
                }
            } else {
                sendMessage("Sorry to see you want to leave. Type `/exit confirm` to PERMANENTLY delete your data.");
            }
        }
    }
    // /join - join the game if not already involved
    if (args[0] == "/join") {
        var displayName = "";
        if (platform == "telegram") {
            if (platformObject.msg.from.first_name)
                displayName = platformObject.msg.from.first_name + (platformObject.msg.from.last_name ? " " + platformObject.msg.from.last_name : "");
            else
                displayName = telegramName;
        } else if (platform == "discord") {
            displayName = platformObject.msg.author.username;
        }

        try {
            let getUser = await userData.getUserByName(IDs.discord, IDs.telegram);
            sendMessage(getUser.displayName + ", you have already joined the game.");
        } catch (e) {
            console.log("Failed to get user with that name, going to make a new one.");
            let newUser = await userData.createUser(displayName, IDs.discord.toString(), IDs.telegram.toString());
            console.log(newUser);
            sendMessage(newUser.displayName + ", welcome to BotCoin Exchange! You now have $" + newUser.cash + " in your account. Type /help for more info.");
        }
    }
    // /inherit - used to link Telegram and Discord accounts
    if (args[0] == "/inherit") {
        try {
            let getUser = await userData.getUserByName(IDs.discord, IDs.telegram);
            console.log(getUser);
            if (args.length > 1) {
                console.log ("Time to update?");
                let updatedUser = await userData.updateUser(getUser._id, false, (platform == "discord" ? false : args[1]), (platform == "telegram" ? false : args[1]), getUser.cash, false, false, false);
                console.log("Updated user:");
                console.log(updatedUser);
                sendMessage("You have now inherited that ID into your account.");
            } else if (getUser._id != undefined) {
                sendMessage("Type /inherit on the other platform to learn what your platform ID is -- then type that over here as `/inherit 12345` to link the two accounts.");
            } else {
                sendMessage("In order to inherit this account onto an existing BotCoin Exchange account on the other platform, please copy and paste the following message as the other user.");
                sendMessage("/inherit " + (platform == "discord" ? IDs.discord : IDs.telegram));
            }
        } catch (e) {
            sendMessage("In order to inherit this account onto an existing BotCoin Exchange account on the other platform, please copy and paste the following message as the other user.");
            sendMessage("/inherit " + (platform == "discord" ? IDs.discord : IDs.telegram));
        }
    }

    // /quote - /quote SYMBOL - returns the value of a stock/symbol
    if (args[0] == "/quote" || args[0] == "/quott") {
        if (args.length > 1) {
            var sym = args[1];
            sym = getSymbol(sym.toUpperCase());
            var resultMessage = await sendMessage("Price of [" + sym + "]: *quoting*");

            console.log(sym);
            var quote = await stockQuote(sym);
            if (quote.price !== undefined) {
                editMessage("Price of " + quote.name + " [" + sym + "]: $" + quote.price, resultMessage);
            } else {
                editMessage(sym + " not found.", resultMessage);
            }
        } else {
            sendMessage("USAGE: /quote SYMBOL");
        }
    }

    // /ping - does this user exist?
    if (args[0] == "/ping") {
        try {
            let getUser = await userData.getUserByName(IDs.discord, IDs.telegram);
            console.log(getUser);
            return await sendMessage("Hello, " + getUser.displayName + ". You have `$" + getUser.cash + "` right now.");
        } catch (e) {
            return await sendMessage(e.message);
        }
    }

}


client.on('message', async msg => {
    if (new Date(msg.createdTimestamp) > startDate && msg.author.id != 388382009732497409) {
        console.log("Got a discord message: " + msg.content);
        return await handleMessage(msg.content, "discord", {msg: msg}, msg.content.toLowerCase().split(" "), {telegram: false, discord: msg.author.id});
    } else {
        console.log("Skipping discord message: " + msg.content);
        return null;
    }
});

bot.on('message', async (msg) => {
    if (new Date(msg.date * 1000) > startDate && msg.text) {
        const chatId = msg.chat.id;
        console.log("Got a telegram message: " + msg.text);
        return await handleMessage(msg.text, "telegram", {chatId: chatId, msg: msg}, msg.text.toLowerCase().split(" "), {telegram: msg.from.id, discord: false});
    } else if (msg.text) {
        console.log("Skipping telegram message: " + msg.text);
        return null;
    }
});


var discordToken = fs.readFileSync("discordtoken.txt", "utf8");
discordtoken = discordtoken.replace("\n", "");
client.login(discordToken);

