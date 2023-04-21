import { default as config } from "./config.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(config.host, config.token)

var maxX = 0;
var maxY = 0;
var mapData = new Array();
var map;

//TODO: Substitute setTimeout with a promise or something similar if possible

await client.onTile((x, y, delivery) => {
    //Update the max coordiantes of the map to know its size
    if (x > maxX) {
        maxX = x;
    }
    if (y > maxY) {
        maxY = y;
    }
    //console.log(x, y, delivery);

    //Push every tile in the mapData array
    mapData.push(x + "-" + y + "-" + delivery);
});

setTimeout(() => {
    //Create the map and the varaible k used to iterate the mapData array
    map = new Array(maxX);
    var k = 0;

    for (var i = 0; i <= maxX; i++) {
        //Create the current column of the map
        var currentColumn = new Array(maxY);
        for (var j = 0; j <= maxY; j++) {

            //Get the next tile coordinates
            if (k < mapData.length) {
                var nextX = mapData[k].split('-')[0];
                var nextY = mapData[k].split('-')[1];
            }

            //Check if the current tile is the next tile in the mapData array, otherwise it's a wall and write B
            if (nextX == i && nextY == j) {
                currentColumn[j] = mapData[k].split('-')[2];
                k++;
            } else {
                currentColumn[j] = "B";
            }
        }
        //Push the current column in the map
        map[i] = currentColumn;
    }
    console.log(map);
}, 1000);

function findDelivery(myYou) {
    var bestX = maxX * 100;
    var bestY = maxY * 100;

    //Scan the whole matrix and find the closest delivery point, then call the buildPath function
    for (var i = 0; i < map.length; i++) {
        for (var j = 0; j < map[i].length; j++) {
            if (map[i][j] == "true") {
                if ((Math.sqrt((myYou.x - i) ^ 2 + (myYou.y - j) ^ 2)) < (Math.sqrt((myYou.x - bestX) ^ 2 + (myYou.y - bestY) ^ 2))) {
                    bestX = i;
                    bestY = j;
                }
            }
        }
    }

    console.log("Best delivery found at: " + bestX + "-" + bestY);
    buildPath(bestX, bestY, myYou.x, myYou.y);
}

function buildPath(targetX, targetY, myX, myY) {

    // Defining visited array to keep track of already visited indexes
    let visited = new Array(maxX);
    for (let i = 0; i < maxX; i++) {
        visited[i] = new Array(maxY);
        for (let j = 0; j < maxY; j++) {
            visited[i][j] = false;
        }
    }

    visited[myX][myY] = true;
    var actions = [];

    // Starting from i, j and then finding the path
    if (checkPath(myX, myY, visited, targetX, targetY, actions)) {
        // move to the target

        while (actions.length > 0) {
            var action = actions.pop();
            move(action);
        }
    }
}

async function move(direction) {
    await client.move(direction);
}

// Method for checking boundariess
function isSafe(i, j) {
    if (i >= 0 && i < map.length && j >= 0 && j < map[0].length)
        return true;
    return false;
}

// Returns true if there is a path from a source (a cell with value 1) to a destination (a cell with value 2)
function checkPath(i, j, visited, targetX, targetY, actions) {
    // Checking the boundaries, walls and whether the cell is unvisited
    if (isSafe(i, j) && map[i][j] != "B" && !visited[i][j]) {
        // Make the cell visited
        visited[i][j] = true;

        // if the cell is the required destination then return true
        if (i == targetX && j == targetY)
            return true;

        // traverse up
        let up = checkPath(i, j - 1, visited, targetX, targetY, actions);

        // if path is found in up direction return true
        if (up) {
            actions.push("up");
            return true;
        }
        // traverse left
        let left = checkPath(i - 1, j, visited, targetX, targetY, actions);

        // if path is found in left direction return true
        if (left) {
            actions.push("left");
            return true;
        }

        // traverse down
        let down = checkPath(i, j + 1, visited, targetX, targetY, actions);

        // if path is found in down direction return true
        if (down) {
            actions.push("down");
            return true;
        }

        // traverse right
        let right = checkPath(i + 1, j, visited, targetX, targetY, actions);

        // if path is found in right direction return true
        if (right) {
            actions.push("right");
            return true;
        }
    }
    // no path has been found
    return false;
}

async function agentLoop() {

    // get random previous direction
    var previous = ['up', 'right', 'down', 'left'][Math.floor(Math.random() * 4)];

    while (true) {
        let tried = [];
        var myYou = {};
        var myParcels = [];

        await client.pickup();

        while (tried.length < 4) {

            let current = { up: 'down', right: 'left', down: 'up', left: 'right' }[previous] // backward

            if (tried.length < 3) { // try ahaed or turn (before going backward)
                current = ['up', 'right', 'down', 'left'].filter(d => d != current)[Math.floor(Math.random() * 3)];
            }

            if (!tried.includes(current)) {
                if (await client.move(current)) {

                    //Gets coordinates of the agent from the server
                    client.onYou(you => {
                        //Rounding to avoid .6 and .4 coordinates (.6 -> moving in the next integer, .4 -> moving in the previous integer)
                        you.x = Math.round(you.x);
                        you.y = Math.round(you.y);
                        myYou = you
                    });

                    console.log(myYou.x, myYou.y);

                    //Gets the parcels sensed by the agent
                    await client.onParcelsSensing((parcels) => {
                        //Add the parcels carried by the agent to the myParcels array
                        for (let parcel of parcels) {
                            if (parcel.carriedBy != null && parcel.carriedBy == myYou.id && !(parcel in myParcels)) {
                                myParcels.push(parcel);
                            }
                        }
                    });

                    //If the agent is carrying a parcel, go to the nearest delivery point
                    if (myParcels.length != 0) {
                        console.log("I'm carrying a parcel");

                        findDelivery(myYou);
                    }

                    //if the agent is on the border of the map, put down the parcel
                    if (myYou.x == 0 || myYou.x == maxX || myYou.y == 0 || myYou.y == maxY) {
                        await client.putdown();
                    }

                    previous = current;
                    break;
                }

                tried.push(current);
            }

        }

        if (tried.length == 4) {
            console.log('stucked');
            await client.timer(1000); // stucked, wait 1 sec and retry
        }
    }
}

agentLoop()