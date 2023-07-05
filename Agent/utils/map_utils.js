// CHANGE THIS TO TEST
// const extended = false;
// const verbose = true;
// const sizeX = 10;
// const sizeY = 10;
// const agents_num = 3;

function divideMatrix(matrix, maxX, maxY, n, extended = false, verbose = false) {
  // create a copy of the matrix in mapData
  const mapData = matrix.map((arr) => arr.slice());
  const numRows = maxX //matrix.length;
  const numCols = maxY //matrix[0].length;
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

  for (let i = 0; i < slices.length; i++) {
    for (let j = 0; j < slices[i].length; j++) {
      mapData[slices[i][j][0]][slices[i][j][1]] = i;
    }
  }
  if (verbose) console.table(mapData);
  // create a copy of mapData in mapData2
  const mapData2 = matrix.map((arr) => arr.slice());

  for (let i = 0; i < maxX; i++) {
    for (let j = 0; j < maxY; j++) {
      var neighbors = getNeighbors(mapData, i, j, extended);
      var neighborsSet = new Set(neighbors);
      var count = 0;
      for (let k = 0; k < neighbors.length; k++) {
        if (neighbors[k] == mapData[i][j]) count++;
      }
      if (count <= 3) {
        mapData2[i][j] = [...Array.from(neighborsSet)];
      } else mapData2[i][j] = [mapData[i][j]];
    }
  }
  if (verbose) console.table(mapData2);

  const slices_final = [];
  for (let i = 0; i < n; i++) {
    slices_final.push([]);
  }
  for (let i = 0; i < maxX; i++) {
    for (let j = 0; j < maxY; j++) {
      for (let k = 0; k < mapData2[i][j].length; k++) {
        slices_final[mapData2[i][j][k]].push([i, j]);
      }
    }
  }

  const center_spots = [];
  slices_final.forEach((slice) => {
    var xs = 0
    var ys = 0
    slice.forEach((element) => {
        xs += element[0];
        ys += element[1];
    });
    var center_spot = [Math.floor(xs / slice.length), Math.floor(ys / slice.length)];
    center_spots.push(center_spot);
  });

  return [center_spots, slices_final];
}

function getNeighbors(matrix, row, col, extended = false) {
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

  if (extended) return neighbors;

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

export { divideMatrix, getNeighbors };

// const mapData = new Array(sizeX).fill(99).map(() => new Array(sizeY).fill(99));
// const [center_spots, slices_res] = divideMatrix(mapData, agents_num, extended, verbose);
// console.log(center_spots);



