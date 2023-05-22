//Test to put Astar in a separate file, problems with the GridPoint class

export class Astar {
    constructor(maxX, maxY, currentX, currentY, targetX, targetY) {
        this.cols = maxX;
        this.rows = maxY;
        this.startX = currentX;
        this.startY = currentY;
        this.destX = targetX;
        this.destY = targetY;
        this.start;
        this.end;
        this.grid;
        this.path = []; //path used by A* to compute the shortest path
        this.movemements = []; //set of movements to get to the target expressed in [right, left, up, down]
        this.openSet = []; //array containing unevaluated grid points
        this.closedSet = []; //array containing completely evaluated grid points
    }

    init() {
        for (let i = 0; i < this.cols; i++) {
            this.grid[i] = new Array(this.rows);
        }

        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                this.grid[i][j] = new this.GridPoint(i, j);
            }
        }

        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                this.grid[i][j].updateNeighbors(this.grid);
            }
        }

        this.start = this.grid[this.startX][this.startY];
        this.end = this.grid[this.destX][this.destY];

        this.openSet.push(this.start);
    }

    manhattanHeuristic(position0, position1) {
        let d1 = Math.abs(position1.x - position0.x);
        let d2 = Math.abs(position1.y - position0.y);

        return d1 + d2;
    }

    search() {

        this.grid = new Array(this.cols); //2D array containing all the grid points

        this.init();

        while (this.openSet.length > 0) {
            //assumption lowest index is the first one to begin with
            let lowestIndex = 0;
            for (let i = 0; i < this.openSet.length; i++) {
                if (this.openSet[i].f < this.openSet[lowestIndex].f) {
                    lowestIndex = i;
                }
            }
            let current = this.openSet[lowestIndex];

            if (current === this.end) {
                let temp = current;
                this.path.push(temp);
                this.movemements.push(temp.movement);
                while (temp.parent) {
                    this.path.push(temp.parent);
                    this.movemements.push(temp.parent.movement);
                    temp = temp.parent;
                }

                this.movemements.pop();
                return this.movemements.reverse();
            }

            //remove current from openSet
            this.openSet.splice(lowestIndex, 1);
            //add current to closedSet
            this.closedSet.push(current);

            let neighbors = current.neighbors;
            let neighborsMovement = current.neighborsMovement;

            for (let i = 0; i < neighbors.length; i++) {
                let neighbor = neighbors[i];
                let movement = neighborsMovement[i];

                if (!this.closedSet.includes(neighbor)) {
                    let possibleG = current.g + 1;

                    if (!this.openSet.includes(neighbor)) {
                        this.openSet.push(neighbor);
                    } else if (possibleG >= neighbor.g) {
                        continue;
                    }

                    neighbor.g = possibleG;
                    neighbor.h = this.manhattanHeuristic(neighbor, end);
                    neighbor.f = neighbor.g + neighbor.h;
                    neighbor.parent = current;
                    neighbor.movement = movement;
                }
            }
        }
        return [];
    }
}

Astar.GridPoint(x, y) = class {
    constructor() {
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
            if (i < this.cols - 1 && this.mapData[i + 1][j] != 0) {
                this.neighbors.push(this.grid[i + 1][j]);
                this.neighborsMovement.push("right");
            }
            if (i > 0 && this.mapData[i - 1][j] != 0) {
                this.neighbors.push(this.grid[i - 1][j]);
                this.neighborsMovement.push("left");
            }
            if (j < this.rows - 1 && this.mapData[i][j + 1] != 0) {
                this.neighbors.push(this.grid[i][j + 1]);
                this.neighborsMovement.push("up");
            }
            if (j > 0 && this.mapData[i][j - 1] != 0) {
                this.neighbors.push(this.grid[i][j - 1]);
                this.neighborsMovement.push("down");
            }
        };
    }
}