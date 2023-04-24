import { default as config } from "./config.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(config.host, config.token)

var maxX = 0;
var maxY = 0;

// set of points
var points = new Set();
// dictionary of deliery points with key = point and value = delivery
var deliveryPoints = new Set();

var mapData = new Array();

//Request to the server every tile present in the map
client.onTile((x, y, delivery) => {
    //Update the max coordiantes of the map to know its size
    maxX = x > maxX ? x : maxX;
    maxY = y > maxY ? y : maxY;

    //Push every tile in the mapData array
    points.add([x,y])
    //console.log(x, y, delivery);
    if(delivery == "true")
        deliveryPoints.add([x,y])
});

setTimeout(() => {
    // create a matrix maxX x maxY and fill with 0 
    mapData = new Array(maxX+1).fill(0).map(() => new Array(maxY+1).fill(0));
    console.log("Map size: " + maxX + "x" + maxY);
    points.forEach((point) => {
        //mapData[point[0]][point[1]] = 1;
        try {
            mapData[point[0]][point[1]] = 1;
        }
        catch (e) {
            console.log("Error: " + e + " " + point + " " + maxX + " " + maxY	)
        }
    });
    // if a point is in deliveryPoints set it to 2
    deliveryPoints.forEach((point) => {
        mapData[point[0]][point[1]] = 2;
    });
}, 2000);

async function moveAction(direction){
    await client.move(direction)
}

function findDelivery(start) {
    var distanceX = min(start[0], maxX - start[0]);
    var distanceY = min(start[1], maxY - start[1]);
    //var endpoint = distanceX < distanceY ? [start[0], distanceY] : [distanceX, start[1]];
    var endpoint;
    if (distanceX < distanceY){
        endpoint = [start[0], distanceY];
    }
    else{
        endpoint = [distanceX, start[1]];
    }
    // check if the endpoint is a delivery point
    if (mapData[endpoint[0]][endpoint[1]] == 2) {
        console.log("Found delivery point: " + endpoint);
    }
    // if not, find the nearest delivery point
    else{
        var minDistance = maxX + maxY;
    var minPoint = [0, 0];
    deliveryPoints.forEach((point) => {
        var distance = heuristicCostEstimate(start, point);
        if (distance < minDistance) {
            minDistance = distance;
            minPoint = point;
        }
    });
    endpoint = minPoint;}
    var steps = aStar(start, endpoint);
    while (steps.length > 0){
        moveAction(steps.pop());
    }

}



function min(a, b) {
    return a < b ? a : b;
}

function heuristicCostEstimate(start, end) {
    return Math.abs(start[0] - end[0]) + Math.abs(start[1] - end[1]);
}

function getNeighbors(point) {
    console.log(point)
    var neighbors = new Set();
    if (point[0] > 0 && mapData[point[0] - 1][point[1]] != 0) {
        neighbors.add((point[0] - 1, point[1]));
    }
    if (point[0] < maxX && mapData[point[0] + 1][point[1]] != 0) {
        neighbors.add((point[0] + 1, point[1]));
    }
    if (point[1] > 0 && mapData[point[0]][point[1] - 1] != 0) {
        neighbors.add((point[0], point[1] - 1));
    }
    if (point[1] < maxY && mapData[point[0]][point[1] + 1] != 0) {
        neighbors.add((point[0], point[1] + 1));
    }
    return neighbors;
}

function reconstructPath(cameFrom, current) {//using "up", "right", "down", "left" as directions
    var totalPath = [];
    while (cameFrom.has(current)) {
        var previous = cameFrom.get(current);
        if (current[0] - previous[0] == 1) {
            totalPath.push("right");
        } else if (current[0] - previous[0] == -1) {
            totalPath.push("left");
        } else if (current[1] - previous[1] == 1) {
            totalPath.push("down");
        } else if (current[1] - previous[1] == -1) {
            totalPath.push("up");
        }
        current = previous;
    }
    return totalPath.reverse();
}

// A* algorithm
function aStar(start, end) {
    console.log("ASTAR Start: " + start + " End: " + end);
    var openSet = new Set();
    var closedSet = new Set();
    var cameFrom = new Map();

    var gScore = new Map();
    var fScore = new Map();

    gScore.set(start, 0);
    fScore.set(start, heuristicCostEstimate(start, end));

    openSet.add(start);

    while (openSet.size > 0) {
        var current = openSet.values().next().value[0];
        console.log("Current: " + current);
        openSet.forEach((point) => {
            if (fScore.get(point) < fScore.get(current)) {
                current = point;
            }
        });

        if (current == end) {
            return reconstructPath(cameFrom, current);
        }

        openSet.delete(current);
        closedSet.add(current);

        var neighbors = getNeighbors(current);
        neighbors.forEach((neighbor) => {
            if (closedSet.has(neighbor)) {
                return;
            }

            var tentative_gScore = gScore.get(current) + 1;

            if (!openSet.has(neighbor)) {
                openSet.add(neighbor);
            } else if (tentative_gScore >= gScore.get(neighbor)) {
                return;
            }

            cameFrom.set(neighbor, current);
            gScore.set(neighbor, tentative_gScore);
            fScore.set(neighbor, gScore.get(neighbor) + heuristicCostEstimate(neighbor, end));
        });
    }

    return null;
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

                    //console.log(myYou.x, myYou.y);

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

                        findDelivery([myYou.x, myYou.y]);
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

agentLoop();