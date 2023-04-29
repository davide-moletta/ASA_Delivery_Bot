import { default as config } from "./config.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(config.host, config.token)

//0 are walls
//1 are walkable tiles
//2 are delivery tiles

// max coordinates of the map
var maxX = 0;
var maxY = 0;

var points = new Set(); // set of points

var deliveryPoints = new Set(); // dictionary of deliery points with key = point and value = delivery

var mapData; // the map as a 2D array

let cols = 0; //columns in the grid
let rows = 0; //rows in the grid

let grid; //array of all the grid points

let openSet = []; //array containing unevaluated grid points
let closedSet = []; //array containing completely evaluated grid points

let start; //starting grid point
let end; // ending grid point (goal)
let path = []; // array containing the path from the start to the end for Astar
let movemements = []; // array containing the movements to follow the path of Astar

client.onConfig((config) => {
    console.log(config);
});

client.onMap((width, height, tiles) => {
    maxX = width;
    maxY = height;

    mapData = new Array(maxX).fill(0).map(() => new Array(maxY).fill(0));

    tiles.forEach((tile) => {
        mapData[tile.x][tile.y] = tile.delivery ? 2 : 1;
    });

    console.log(mapData);
});

//Manhattan distance
function heuristic(position0, position1) {
    let d1 = Math.abs(position1.x - position0.x);
    let d2 = Math.abs(position1.y - position0.y);

    return d1 + d2;
}

//constructor function to create all the grid points as objects containing the data for the points
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

//TODO try map instead of array for parcels (lecture  of lab)
//TODO fix the fact that the agent follow both the path and the right-left rule
async function agentLoop() {

    await client.move("down");
    
    while (true) {
        var me = {};
        var myParcels = new Map();

        //Gets coordinates of the agent from the server
        client.onYou(you => {
            //Rounding to avoid .6 and .4 coordinates (.6 -> moving in the next integer, .4 -> moving in the previous integer)
            you.x = Math.round(you.x);
            you.y = Math.round(you.y);
            me = you;
        });

        client.onParcelsSensing(async (parcels) => {
            //Add the parcels carried by the agent to the myParcels array
            for (const parcel of parcels) {
                myParcels.set(parcel.id, parcel);
            }
        });
    }
}

agentLoop() 