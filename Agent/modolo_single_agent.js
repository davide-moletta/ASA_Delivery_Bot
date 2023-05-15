import { default as config_multi } from "./config_multi.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
// import map_utils_playground.js functions
import { divideMatrix } from "./map_utils_playground.js";

const client = new DeliverooApi(config_multi.host1, config_multi.token1)

/* CREATE MAP DATA */
var maxX = 0;
var maxY = 0;
var mapData;
var slices_res;
var center_spots;
client.move("down");
client.onMap((width, height, tiles) => {
  maxX = width;
  maxY = height;
  console.log("Map size: " + maxX + "x" + maxY);
  mapData = new Array(maxX).fill(0).map(() => new Array(maxY).fill(0));

  tiles.forEach((tile) => {
    mapData[tile.x][tile.y] = tile.delivery ? 2 : 1;
  });

  console.table(mapData);
  [center_spots, slices_res] = divideMatrix(mapData, 1);
  console.log("Center spots: " + center_spots);
});

const parcels = new Map();
client.onParcelsSensing( async ( perceived_parcels ) => {
    for (const p of perceived_parcels) {
      // check if parcel is in the slice
      if ([p.x, p.y] in slices_res[0]) {
        parcels.set( p.id, p)
    }
} });

/* DIVIDE USING divideMatrix WITH clients.length */

// const slices_res = divideMatrix(mapData, clients.length);

function plan(starting_point, goal_point) {
  const moves = [];
  var lastPoint = starting_point;
  while (goal_point[0] != lastPoint[0] || goal_point[1] != lastPoint[1]) {
    if (lastPoint[0] < goal_point[0]) {
      moves.push("right");
      lastPoint[0] += 1;
    } else if (lastPoint[0] > goal_point[0]) {
      moves.push("left");
      lastPoint[0] -= 1;
    } else if (lastPoint[1] < goal_point[1]) {
      moves.push("up");
      lastPoint[1] += 1;
    } else if (lastPoint[1] > goal_point[1]) {
      moves.push("down");
      lastPoint[1] -= 1;
    }
  }
  return moves;
}

/* CREATE AN AGENT LOOP THAT MAKES THE AGENT WALK LONG THE BORDER*/
function abs(num) {
  if (num < 0) {
    return -num;
  }
  return num;
}

// TODO: an agentLoop function with belief, intent, goals, planning etc
async function agentLoop(agent, goal_point, i) {
  await agent.move("right");
  var starting_point;

  agent.onYou(async (you) => {
    you.x = Math.round(you.x);
    you.y = Math.round(you.y);
    starting_point = [you.x, you.y];

    console.log("Starting point: " + starting_point + " for agent " + i);

    const moves = plan(starting_point, goal_point);
    var time = abs(i - 3) * 500;
    for (let i = 0; i < moves.length; i++) {
      await timer(time);
      await agent.move(moves[i]);
    }
    console.log("Agent " + i + " has reached its goal point: " + goal_point);
  });
}

/* GIVE EACH AGENT ITS SLICE OF MAP */
await timer(1000);
const goal_point = center_spots[i];
console.log("Goal point: " + goal_point + " for agent " + i);
agentLoop(client, goal_point, i);
