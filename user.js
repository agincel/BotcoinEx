/*
    Adam Gincel
    user.js
    Defines the userItems mongoCollections
*/ 


const mongoCollections = require("./mongoCollections");
const userItems = mongoCollections.userItems;
const uuidV4 = require("uuid/V4");

let exportedMethods = {
    getUser(id) {
        if (!id) 
            return Promise.reject("You must provide an id to search for");
        
        return userItems().then((userCollection) => {
            return userCollection.findOne({_id: id});
        }).catch((error) => {
            return Promise.reject(error);  
        });
    },
    getUserByName(du, tu) {
        if (du !== false) {
            return userItems().then((userCollection) => {
                return userCollection.findOne({discordUser: du.toString()});
            }).catch((error) => {
                return Promise.reject(error);
            });
        } else if (tu !== false) {
            return userItems().then((userCollection) => {
                return userCollection.findOne({telegramUser: tu.toString()});
            }).catch((error) => {
                return Promise.reject(error);
            });
        } else {
            return Promise.reject("No username specified.");
        }
    },
    getAllUsers() {
        return userItems().then((userCollection) => {
            return userCollection.find().toArray();
        });
    },
    createUser(displayName, discordUser, telegramUser) {
        if (displayName.length > 20)
            displayName = displayName.substring(0, 19);
        return userItems().then((userCollection) => {
            let newUser = {
                _id: uuidV4(),
                displayName: displayName,
                discordUser: discordUser,
                telegramUser: telegramUser,
                cash: 15000.0,
                portfolio: {},
                shorts: {},
                other: {}
            };
            
            return userCollection
                .insertOne(newUser)
                .then((newInsertInformation) => {
                    return newInsertInformation.insertedId;
                })
                .then((newId) => {
                    return this.getUser(newId);
                });
        }).catch((error) => {
            console.log(error);
            return Promise.reject("User was unable to be created");
        });
    },
    updateUser(id, displayName, discordUser, telegramUser, cash, portfolio, shorts, other) {
        return userItems().then((userCollection) => {
           return this.getUser(id).then((userToUpdate) => {
                if (displayName === false) {
                    displayName = userToUpdate.displayName;
                }
                if (discordUser === false) {
                    discordUser = userToUpdate.discordUser;
                }

                if (telegramUser === false) {
                    telegramUser = userToUpdate.telegramUser;
                }

                if (cash === false) {
                    cash = userToUpdate.cash;
                }

                if (portfolio === false) {
                    portfolio = userToUpdate.portfolio;
                }

                if (shorts === false) {
                    shorts = userToUpdate.shorts;
                }

                if (other === false)
                    other = userToUpdate.other;

                let updatedUser = {
                    _id: userToUpdate._id,
                    displayName: displayName,
                    discordUser: discordUser,
                    telegramUser: telegramUser,
                    cash: cash,
                    portfolio: portfolio,
                    shorts: shorts,
                    other: other
                }

                return userCollection.updateOne({_id: id}, updatedUser).then(() => {
                        return this.getUser(id);
                });
            });
        });
    },
    removeUser(id) {
        if (!id) 
            return Promise.reject("You must provide an id to search for");
        
        return userItems().then((userCollection) => {
            return userCollection
                .removeOne({_id: id})
                .then((deletionInfo) => {
                    if (deletionInfo.deletedCount === 0) {
                        throw(`Could not delete user with id of ${id}`)
                    }
                });
        });
    },
}

module.exports = exportedMethods;