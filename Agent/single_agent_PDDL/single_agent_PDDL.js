import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { planner, mapParser, meParser, parcelsparser, agentsParser } from "./test_PDDL_moletta.js";

const client = new DeliverooApi(
  "http://localhost:8080/?name=Cannarsi",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5ZDBiMDA0NDdlIiwibmFtZSI6IkNhbm5hcnNpIiwiaWF0IjoxNjgyMDk4NTI0fQ.juYE2bZS6jm8ghTqrpfheFSVSjpIz_C1s-bPIj4LN1w"
);

let maxX = 0;
let maxY = 0;
var mapData; // the map as a 2D array
const delivery_points = [];


client.onMap((width, height, tiles) => {
  maxX = width;
  maxY = height;

  mapData = new Array(maxX).fill(0).map(() => new Array(maxY).fill(0));

  tiles.forEach((tile) => {
    mapData[tile.x][tile.y] = tile.delivery ? 2 : 1;
    if (tile.delivery) {
      delivery_points.push([tile.x, tile.y]);
    }
  });
  //once the map is complete calls the function to save the string of the map as a PDDL problem
  mapParser(mapData);
});
setTimeout(() => { }, 1000);

const me = {};
client.onYou(({ id, name, x, y, score }) => {
  me.id = id;
  me.name = name;
  me.x = x;
  me.y = y;
  me.score = score;
  //calls the function to save the string of the agent as a PDDL problem
  //meParser(me);
});

const parcels = new Map();
client.onParcelsSensing(async (perceived_parcels) => {
  for (const p of perceived_parcels) {
    parcels.set(p.id, p);
  }
  //calls the function to save the string of the parcels as a PDDL problem
  //parcelsparser(parcels);
});

const agents = new Map();
client.onAgentsSensing(async (perceived_agents) => {
  for (const a of perceived_agents) {
    agents.set(a.id, a);
  }
  //calls the function to save the string of the enemy agents as a PDDL problem
  //agentsParser(agents);
});



setTimeout(() => {
  planner(parcels, agents, me);
}, 50000);
