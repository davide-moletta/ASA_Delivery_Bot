import { default as config } from "./config.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(config.host, config.token)

//0 are walls
//1 are walkable tiles
//2 are delivery tiles

var maxX = 0;
var maxY = 0;

// set of points
var points = new Set();
// dictionary of deliery points with key = point and value = delivery
var deliveryPoints = new Set();

var mapData;

//Request to the server every tile present in the map
client.onTile((x, y, delivery) => {
    //Update the max coordiantes of the map to know its size
    maxX = x > maxX ? x : maxX;
    maxY = y > maxY ? y : maxY;

    //Push every tile in the mapData array
    points.add([x, y])
    if (delivery)
        deliveryPoints.add([x, y])
});




let cols = 0; //columns in the grid
let rows = 0; //rows in the grid

let grid; //array of all the grid points

let openSet = []; //array containing unevaluated grid points
let closedSet = []; //array containing completely evaluated grid points

let start; //starting grid point
let end; // ending grid point (goal)
let path = [];
let movemements = [];

//heuristic we will be using - Manhattan distance
//for other heuristics visit - https://theory.stanford.edu/~amitp/GameProgramming/Heuristics.html
function heuristic(position0, position1) {
    let d1 = Math.abs(position1.x - position0.x);
    let d2 = Math.abs(position1.y - position0.y);

    return d1 + d2;
}

//constructor function to create all the grid points as objects containind the data for the points
function GridPoint(x, y) {
    this.x = x; //x location of the grid point
    this.y = y; //y location of the grid point
    this.f = 0; //total cost function
    this.g = 0; //cost function from start to the current grid point
    this.h = 0; //heuristic estimated cost function from current grid point to the goal
    this.neighbors = []; // neighbors of the current grid point
    this.neighborsMovement = []; // movement to get to the neighbors of the current grid point
    this.parent = undefined; // immediate source of the current grid point
    this.movement = undefined; // movement to get to the current grid point

    // update neighbors array for a given grid point
    this.updateNeighbors = function (grid) {
        let i = this.x;
        let j = this.y;
        if (i < cols - 1 && mapData[i + 1][j] != 0) {
            this.neighbors.push(grid[i + 1][j]);
            this.neighborsMovement.push("right");
        }
        if (i > 0 && mapData[i - 1][j] != 0) {
            this.neighbors.push(grid[i - 1][j]);
            this.neighborsMovement.push("left");
        }
        if (j < rows - 1 && mapData[i][j + 1] != 0) {
            this.neighbors.push(grid[i][j + 1]);
            this.neighborsMovement.push("up");
        }
        if (j > 0 && mapData[i][j - 1] != 0) {
            this.neighbors.push(grid[i][j - 1]);
            this.neighborsMovement.push("down");
        }
    };
}

//initializing the grid
function init(currentX, currentY, targetX, targetY) {
    //making a 2D array
    for (let i = 0; i < cols; i++) {
        grid[i] = new Array(rows);
    }

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            grid[i][j] = new GridPoint(i, j);
        }
    }

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            grid[i][j].updateNeighbors(grid);
        }
    }

    start = grid[currentX][currentY];
    end = grid[targetX][targetY];

    openSet.push(start);
}

//A star search implementation

function search(currentX, currentY, targetX, targetY) {
    cols = maxX + 1;
    rows = maxY + 1;
    grid = new Array(cols);


    init(currentX, currentY, targetX, targetY);
    while (openSet.length > 0) {
        //assumption lowest index is the first one to begin with
        let lowestIndex = 0;
        for (let i = 0; i < openSet.length; i++) {
            if (openSet[i].f < openSet[lowestIndex].f) {
                lowestIndex = i;
            }
        }
        let current = openSet[lowestIndex];

        if (current === end) {
            let temp = current;
            path.push(temp);
            movemements.push(temp.movement);
            while (temp.parent) {
                path.push(temp.parent);
                movemements.push(temp.parent.movement);
                temp = temp.parent;
            }

            movemements.pop();
            // return the traced path
            return movemements.reverse();
        }

        //remove current from openSet
        openSet.splice(lowestIndex, 1);
        //add current to closedSet
        closedSet.push(current);

        let neighbors = current.neighbors;
        let neighborsMovement = current.neighborsMovement;

        for (let i = 0; i < neighbors.length; i++) {
            let neighbor = neighbors[i];
            let movement = neighborsMovement[i];

            if (!closedSet.includes(neighbor)) {
                let possibleG = current.g + 1;

                if (!openSet.includes(neighbor)) {
                    openSet.push(neighbor);
                } else if (possibleG >= neighbor.g) {
                    continue;
                }

                neighbor.g = possibleG;
                neighbor.h = heuristic(neighbor, end);
                neighbor.f = neighbor.g + neighbor.h;
                neighbor.parent = current;
                neighbor.movement = movement;

            }
        }
    }

    //no solution by default
    return [];
}

//Da rivedere ma così funziona, tocca capire come funzionano bene le robe asincrone
async function moveToTarget(movemements) {
    var movemementsDone = [movemements.length];

    movemementsDone[0] = await client.move(movemements[0]);
    for (var i = 1; i < movemements.length; i++) {
        if (movemementsDone[i - 1]) {
            movemementsDone[i] = await client.move(movemements[i]);
        }
    }
}

setTimeout(() => {
    // create a matrix maxX x maxY and fill with 0 
    mapData = new Array(maxX + 1).fill(0).map(() => new Array(maxY + 1).fill(0));

    points.forEach((point) => {
        mapData[point[0]][point[1]] = 1;
    });

    // if a point is in deliveryPoints set it to 2
    deliveryPoints.forEach((point) => {
        mapData[point[0]][point[1]] = 2;
    });
    //console.log("A*: " + path);

    //moveToTarget(search(0, 2, 6, 7));

}, 500);


//TODO fix the fact that the agent follow both the path and the right-left rule
async function agentLoop() {

    while (true) {
        var myYou = {};
        var myParcels = [];

        if (await client.move("right")) {
            await client.pickup();
            await client.move("left");
            await client.pickup();

        }

        //Gets coordinates of the agent from the server
        client.onYou(you => {
            //Rounding to avoid .6 and .4 coordinates (.6 -> moving in the next integer, .4 -> moving in the previous integer)
            you.x = Math.round(you.x);
            you.y = Math.round(you.y);
            myYou = you

        });
        console.log(myYou);
        client.onParcelsSensing((parcels) => {
            //Add the parcels carried by the agent to the myParcels array
            for (let parcel of parcels) {
                if (parcel.carriedBy == myYou.id && !(parcel in myParcels)) {
                    myParcels.push(parcel);
                }
            }
        });

        console.log(myParcels);
        if (myParcels.length != 0) {
            moveToTarget(search(myYou.x, myYou.y, 9, 2));
            await client.putdown();
        }
    }
}

agentLoop()

/*async function agentLoop() {

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
                    client.onParcelsSensing((parcels) => {
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
 */