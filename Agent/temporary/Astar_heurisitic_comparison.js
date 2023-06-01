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

function manhattanHeuristic(position0, position1) {
    let d1 = Math.abs(position1.x - position0.x);
    let d2 = Math.abs(position1.y - position0.y);

    return d1 + d2;
}

//Best from the tests
function euclideanHeuristic(position0, position1) {
    let d1 = Math.abs(position1.x - position0.x);
    let d2 = Math.abs(position1.y - position0.y);

    return Math.sqrt(d1 * d1 + d2 * d2);
}

function chebyshevHeuristic(position0, position1) {
    let d1 = Math.abs(position1.x - position0.x);
    let d2 = Math.abs(position1.y - position0.y);

    return Math.max(d1, d2);
}

function diagonalHeuristic(position0, position1) {
    let d1 = Math.abs(position1.x - position0.x);
    let d2 = Math.abs(position1.y - position0.y);

    return Math.max(d1, d2) + (Math.SQRT2 - 2) * Math.min(d1, d2);
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

function search(currentX, currentY, targetX, targetY, heuristic) {
    cols = maxX + 1;
    rows = maxY + 1;
    grid = new Array(cols);
    path = [];
    movemements = [];

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

                if (heuristic == "manhattan") {
                    neighbor.h = manhattanHeuristic(neighbor, end);
                } else if (heuristic == "euclidean") {
                    neighbor.h = euclideanHeuristic(neighbor, end);
                } else if (heuristic == "diagonal") {
                    neighbor.h = diagonalHeuristic(neighbor, end);
                } else if (heuristic == "chebyshev") {
                    neighbor.h = chebyshevHeuristic(neighbor, end);
                }
                neighbor.f = neighbor.g + neighbor.h;
                neighbor.parent = current;
                neighbor.movement = movement;
            }
        }
    }

    //no solution by default
    return [];
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


    //Generate random start and end points 
    let start = 0;
    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;
    let manTime = 0;
    let eucTime = 0;
    let diaTime = 0;
    let cheTime = 0;

    for (var i = 0; i < 20; i++) {
        startX = Math.floor(Math.random() * maxX);
        startY = Math.floor(Math.random() * maxY);
        endX = Math.floor(Math.random() * maxX);
        endY = Math.floor(Math.random() * maxY);

        while (mapData[startX][startY] == 0 || mapData[endX][endY] == 0) {
            startX = Math.floor(Math.random() * maxX);
            startY = Math.floor(Math.random() * maxY);
            endX = Math.floor(Math.random() * maxX);
            endY = Math.floor(Math.random() * maxY);
        }

        console.log("From: " + startX + " - " + startY + " To: " + endX + " - " + endY);

        start = Date.now();
        console.log("A* with manhattan heuristic: " + search(startX, startY, endX, endY, "manhattan"));
        manTime = Date.now() -start;
        console.log("Time taken by manhattan: " + manTime + "ms");

        start = Date.now();
        console.log("A* with euclidean heuristic: " + search(startX, startY, endX, endY, "euclidean"));
        eucTime = Date.now() -start;
        console.log("Time taken by euclidean: " + eucTime + "ms");

        start = Date.now();
        console.log("A* with diagonal heuristic: " + search(startX, startY, endX, endY, "diagonal"));
        diaTime = Date.now() -start;
        console.log("Time taken by diagonal: " + diaTime + "ms");

        start = Date.now();
        console.log("A* with chebyshev heuristic: " + search(startX, startY, endX, endY, "chebyshev"));
        cheTime = Date.now() -start;
        console.log("Time taken by chebyshev: " + cheTime + "ms");

        console.log("----------------------- end of: " + i + " cycle --------------------------");
    }
}, 500);
