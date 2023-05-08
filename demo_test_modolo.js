import { default as config_multi } from "./config_multi.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";

const clients = [
    new DeliverooApi(config_multi.host1, config_multi.token1),
    new DeliverooApi(config_multi.host2, config_multi.token2),
    new DeliverooApi(config_multi.host3, config_multi.token3),
    new DeliverooApi(config_multi.host4, config_multi.token4)
];

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
      slice.push(center);
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
    
// // divide the matrix in n parts
// for(let i = 4; i < 5; i++){
//     const mapData = new Array(30).fill(0).map(() => new Array(30).fill(0));
//     const slices_res = divideMatrix(mapData, i);
//     // console.log(slices_res);

//     // update the matrix setting the value of the cells in the slices to the slice index
//     for (let i = 0; i < slices_res.length; i++) {
//         for (let j = 0; j < slices_res[i].length; j++) {
//             if (mapData[slices_res[i][j][0]][slices_res[i][j][1]] == 0)
//                 mapData[slices_res[i][j][0]][slices_res[i][j][1]] = i;
//             else
//                 mapData[slices_res[i][j][0]][slices_res[i][j][1]] = 99;

//         }
// }

// // print the matrix
// console.log("Final matrix with " + i +" agents:")
// console.table(mapData);
  
// }

/* CREATE MAP DATA */

/* DIVIDE USING divideMatrix WITH clients.length */

/* CREATE AN AGENT LOOP THAT MAKES THE AGENT WALK LONG THE BORDER*/

/* GIVE EACH AGENT ITS SLICE OF MAP */

/* ENJOY */
