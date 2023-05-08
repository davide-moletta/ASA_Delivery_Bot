import { default as config } from "./config.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
import FileSystem from "fs";

const client = new DeliverooApi(config.host, config.token)

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
  
  
  
// divide the matrix in n parts
for(let i = 1; i < 11; i++){
    const mapData = new Array(10).fill(0).map(() => new Array(10).fill(0));
    const slices_res = divideMatrix(mapData, i);
    // console.log(slices_res);

    // update the matrix setting the value of the cells in the slices to the slice index
    for (let i = 0; i < slices_res.length; i++) {
        for (let j = 0; j < slices_res[i].length; j++) {
            if (mapData[slices_res[i][j][0]][slices_res[i][j][1]] == 0)
                mapData[slices_res[i][j][0]][slices_res[i][j][1]] = i;
            else
                mapData[slices_res[i][j][0]][slices_res[i][j][1]] = 99;

        }
}

// print the matrix
console.log("Final matrix with " + i +" agents:")
console.table(mapData);
}
