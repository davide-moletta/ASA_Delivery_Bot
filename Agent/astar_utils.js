function findDeliveryPoint(my_x, my_y, delivery_points) {
  let closestDeliveryPoint = { x: 0, y: 0 };
  let closestDistance = 1000000;
  delivery_points.forEach((point) => {
    const dist = distance({ x: my_x, y: my_y }, { x: point[0], y: point[1] });
    if (dist < closestDistance) {
      closestDistance = dist;
      closestDeliveryPoint = point;
    }
  });
  return closestDeliveryPoint;
}

class GridPoint {
  constructor(x, y, mapData, cols, rows) {
    this.x = x; //x location of the grid point
    this.y = y; //y location of the grid point
    this.f = 0; //total cost function
    this.g = 0; //cost function from start to the current grid point
    this.h = 0; //heuristic estimated cost function from current grid point to the goal
    this.neighbors = []; // neighbors of the current grid point
    this.neighborsMovement = []; // movement to get to the neighbors of the current grid point
    this.parent = undefined; // immediate source of the current grid point
    this.movement = undefined; // movement to get to the current grid point
    this.mapData = mapData; // map data
    this.cols = cols; // number of columns in the map
    this.rows = rows; // number of rows in the map

    // update neighbors array for a given grid point
    this.updateNeighbors = function (grid) {
      let i = this.x;
      let j = this.y;
      if (i < this.cols - 1 && this.mapData[i + 1][j] != 0) {
        this.neighbors.push(grid[i + 1][j]);
        this.neighborsMovement.push("right");
      }
      if (i > 0 && this.mapData[i - 1][j] != 0) {
        this.neighbors.push(grid[i - 1][j]);
        this.neighborsMovement.push("left");
      }
      if (j < this.rows - 1 && this.mapData[i][j + 1] != 0) {
        this.neighbors.push(grid[i][j + 1]);
        this.neighborsMovement.push("up");
      }
      if (j > 0 && this.mapData[i][j - 1] != 0) {
        this.neighbors.push(grid[i][j - 1]);
        this.neighborsMovement.push("down");
      }
    };
  }
}

function manhattanHeuristic(position0, position1) {
  let d1 = Math.abs(position1.x - position0.x);
  let d2 = Math.abs(position1.y - position0.y);

  return d1 + d2;
}

function init(
  currentX,
  currentY,
  targetX,
  targetY,
  grid,
  openSet,
  start,
  end,
  cols,
  rows,
  mapData
) {
  //making a 2D array
  for (let i = 0; i < cols; i++) {
    grid[i] = new Array(rows);
  }

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      grid[i][j] = new GridPoint(i, j, mapData, cols, rows);
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

  return [start, end];
}

function getMovements(
  currentX,
  currentY,
  targetX,
  targetY,
  mapData,
  maxX,
  maxY
) {
  const path = [];
  const movemements = [];
  let openSet = []; //array containing unevaluated grid points
  let closedSet = []; //array containing completely evaluated grid points
  let grid = new Array(maxX);
  var cols = maxX;
  var rows = maxY;
  let start;
  let end;

  [start, end] = init(
    currentX,
    currentY,
    targetX,
    targetY,
    grid,
    openSet,
    start,
    end,
    cols,
    rows,
    mapData
  );

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
        neighbor.h = manhattanHeuristic(neighbor, end);
        neighbor.f = neighbor.g + neighbor.h;
        neighbor.parent = current;
        neighbor.movement = movement;
      }
    }
  }

  return [];
}

function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
  const dx = Math.abs(Math.round(x1) - Math.round(x2));
  const dy = Math.abs(Math.round(y1) - Math.round(y2));
  return dx + dy;
}

export { getMovements, findDeliveryPoint };
