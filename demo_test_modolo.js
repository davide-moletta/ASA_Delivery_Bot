import { default as config_multi } from "./config_multi.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";

// const clients = [
//     new DeliverooApi(config_multi.host1, config_multi.token1),
//     new DeliverooApi(config_multi.host2, config_multi.token2),
//     new DeliverooApi(config_multi.host3, config_multi.token3),
//     new DeliverooApi(config_multi.host4, config_multi.token4)
// ];

// divide a circle in n equal slices like pizza adapted to a matrix
function divideMatrix(matrix, n) {
  const numRows = matrix.length;
  const numCols = matrix[0].length;
  const numSlices = n;
  const angle = (2 * Math.PI) / numSlices;
  const center = [Math.floor(numRows / 2), Math.floor(numCols / 2)];
  const slices = [];

  // create the pairs of coordinates for each slice
  for (let i = 0; i < numSlices; i++) {
    const slice = [];
    //slice.push(center);
    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const x = col - center[1];
        const y = center[0] - row;
        var currentAngle = Math.atan2(y, x);
        if (currentAngle < 0) {
          currentAngle += 2 * Math.PI;
        }
        const sliceStartAngle = angle * i;
        const sliceEndAngle = angle * (i + 1);
        if (currentAngle >= sliceStartAngle && currentAngle < sliceEndAngle) {
          slice.push([row, col]);
        }
      }
    }
    slices.push(slice);
  }
  return slices;
}

function getNeighbors(matrix, row, col, minimal = false) {
  const numRows = matrix.length;
  const numCols = matrix[0].length;
  var neighbors = [];
  if (row - 1 >= 0) {
    neighbors.push(matrix[row - 1][col]);
  }
  if (row + 1 < numRows) {
    neighbors.push(matrix[row + 1][col]);
  }
  if (col - 1 >= 0) {
    neighbors.push(matrix[row][col - 1]);
  }
  if (col + 1 < numCols) {
    neighbors.push(matrix[row][col + 1]);
  }
  if(minimal) return neighbors;
  if (row - 1 >= 0 && col + 1 < numCols) {
    neighbors.push(matrix[row - 1][col + 1]);
  }
  if (row - 1 >= 0 && col - 1 >= 0) {
    neighbors.push(matrix[row - 1][col - 1]);
  }
  if (row + 1 < numRows && col + 1 < numCols) {
    neighbors.push(matrix[row + 1][col + 1]);
  }
  if (row + 1 < numRows && col - 1 >= 0) {
    neighbors.push(matrix[row + 1][col - 1]);
  }
  return neighbors;
}

// divide the matrix in n parts
for (let i = 3; i < 4; i++) {
  const mapData = new Array(20).fill(99).map(() => new Array(20).fill(99));
  const slices_res = divideMatrix(mapData, i);
  // console.log(slices_res);

  // update the matrix setting the value of the cells in the slices to the slice index
  for (let i = 0; i < slices_res.length; i++) {
    for (let j = 0; j < slices_res[i].length; j++) {
      //if (mapData[slices_res[i][j][0]][slices_res[i][j][1]] == 99)
        //mapData[slices_res[i][j][0]][slices_res[i][j][1]] = [i];
        mapData[slices_res[i][j][0]][slices_res[i][j][1]] = i;
      //else mapData[slices_res[i][j][0]][slices_res[i][j][1]].push(i);
    }
  }


  // for each cell that has only 2 near cells with the same value, we append all the values of the near cells
  // near = up, down, right, left, up-right, up-left, down-right, down-left
// create a copy of mapData with the same values
const mapData2 = mapData.map((arr) => arr.slice());

const minimal = false
for(let i = 0; i < mapData.length; i++){
    for(let j = 0; j < mapData[i].length; j++){
        var neighbors = getNeighbors(mapData, i, j, minimal);
        var neighborsSet = new Set(neighbors);
        var count = 0;
        for(let k = 0; k < neighbors.length; k++){
            if(neighbors[k] == mapData[i][j]) count++;
        }
        if(count <= 3){
            mapData2[i][j] = [...Array.from(neighborsSet)];
        }
        else mapData2[i][j] = [mapData[i][j]];
    }
}
console.table(mapData);

console.table(mapData2);



  // print the matrix
  //console.log("Final matrix with " + i + " agents:");
  //console.table(mapData);
}

// /* CREATE MAP DATA */
// var maxX = 0;
// var maxY = 0;
// var mapData;

// clients[0].onMap((width, height, tiles) => {
//     maxX = width;
//     maxY = height;

//     mapData = new Array(maxX).fill(0).map(() => new Array(maxY).fill(0));

//     tiles.forEach((tile) => {
//         mapData[tile.x][tile.y] = tile.delivery ? 2 : 1;
//     });

//     //console.log(mapData);
// });

// /* DIVIDE USING divideMatrix WITH clients.length */

// const slices_res = divideMatrix(mapData, clients.length);

// /* CREATE AN AGENT LOOP THAT MAKES THE AGENT WALK LONG THE BORDER*/

// function agentLoop() {
//     clients.forEach((client, index) => {
//         goalPoint = slices_res[index][0];
//         moves = ["up", "down", "left", "right"];
//         // get agent current position
//         var x, y;
//         client.onYou((agent) => {
//             x = agent.x;
//             y = agent.y;
//         });
//         // select the best move for the agent to reach the goal point
//         var bestMove = moves[0];
//         var bestDistance = Math.abs(x - goalPoint[0]) + Math.abs(y - goalPoint[1]);
//         moves.forEach((move) => {
//             var distance = 0;
//             if (move == "up") {
//                 distance = Math.abs(x - 1 - goalPoint[0]) + Math.abs(y - goalPoint[1]);
//             } else if (move == "down") {
//                 distance = Math.abs(x + 1 - goalPoint[0]) + Math.abs(y - goalPoint[1]);
//             } else if (move == "left") {
//                 distance = Math.abs(x - goalPoint[0]) + Math.abs(y - 1 - goalPoint[1]);
//             } else if (move == "right") {
//                 distance = Math.abs(x - goalPoint[0]) + Math.abs(y + 1 - goalPoint[1]);
//             }
//             if (distance < bestDistance) {
//                 bestDistance = distance;
//                 bestMove = move;
//             }
//         });
//         // move the agent
//         client.move(bestMove);
//     });
// }

// /* GIVE EACH AGENT ITS SLICE OF MAP */

// /* ENJOY */

// timer(agentLoop, 100);
