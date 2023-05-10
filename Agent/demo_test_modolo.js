import { default as config_multi } from "./config_multi.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
// import map_utils_playground.js functions
import { divideMatrix } from "./map_utils_playground.js";

const clients = [
  new DeliverooApi(config_multi.host1, config_multi.token1),
  new DeliverooApi(config_multi.host2, config_multi.token2),
  new DeliverooApi(config_multi.host3, config_multi.token3),
  new DeliverooApi(config_multi.host4, config_multi.token4),
];

/* CREATE MAP DATA */
var maxX = 0;
var maxY = 0;
var mapData;
var slices_res;
var center_spots;

clients[0].onMap((width, height, tiles) => {
  maxX = width;
  maxY = height;
  console.log("Map size: " + maxX + "x" + maxY);
  mapData = new Array(maxX).fill(0).map(() => new Array(maxY).fill(0));

  tiles.forEach((tile) => {
    mapData[tile.x][tile.y] = tile.delivery ? 2 : 1;
  });

  console.table(mapData);
  [center_spots, slices_res] = divideMatrix(mapData, clients.length);
});

/* DIVIDE USING divideMatrix WITH clients.length */

// const slices_res = divideMatrix(mapData, clients.length);

/* CREATE AN AGENT LOOP THAT MAKES THE AGENT WALK LONG THE BORDER*/

async function agentLoop(agent) {
  while (true) {
    const moves = ["up", "left", "down", "right"];
    const random_move = moves[Math.floor(Math.random() * moves.length)];
    await agent.move(random_move);
  }
}

/* GIVE EACH AGENT ITS SLICE OF MAP */

/* ENJOY */

clients.forEach((client, i) => {
  agentLoop(client);
});
