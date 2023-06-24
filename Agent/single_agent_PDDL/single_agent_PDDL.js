import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { planner, goalParser, mapParser } from "./test_PDDL_moletta.js"; //, meParser, parcelsparser, agentsParser

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

/**
 * Belief revision function
 */

const me = {};
client.onYou(({ id, name, x, y, score }) => {
  me.id = id;
  me.name = name;
  me.x = Math.round(x);
  me.y = Math.round(y);
  me.score = score;
});
const parcels = new Map();
client.onParcelsSensing(async (perceived_parcels) => {
  for (const p of perceived_parcels) {
    parcels.set(p.id, p);
  }
});
const agents = new Map();
client.onAgentsSensing(async (perceived_agents) => {
  for (const a of perceived_agents) {
    agents.set(a.id, a);
  }
});

function averageScore(args, desire) {
  if (desire == "pickup") {
    //The possible score is the actual score of the parcels that I'm carrying - the distance from me to the parcel I want to pickup * the number of parcels that I'm carrying
    //This is to calculate the average score that I can have once i reach the target parcel
    //Plus the value of the target parcel - the distance to calculate the value of the parcel once I reach it
    var distance = Math.abs(Math.round(args.x) - Math.round(me.x)) + Math.abs(Math.round(args.y) - Math.round(me.y));
    return (args.reward - (args.reward * distance));
  }
  if (desire == "delivery") {
    if (args.length == 0) {
      return Number.MIN_VALUE;
    }
    //The possible score is the actual score of the parcels that I'm carrying - the distance from me to the closest delivery point * the number of parcels that I'm carrying
    //This is to calculate the average score that I can have once i reach the delivery point
    var possibleScore = 0;
    for (const p of args) {
      possibleScore += p.reward;
    }
    return (possibleScore - (args.length * 3));
  }
}

function options() {
  const options = [];
  const deliveries = [];
  for (const parcel of parcels.values()) {
    if (!parcel.carriedBy) {
      options.push({ desire: "pickup", args: parcel });
    } else if (parcel.carriedBy == me.id) {
      deliveries.push(parcel);
    }
  }
  options.push({ desire: "delivery", args: deliveries });

  console.log("options: " + options);


  let best_option = { desire: null, args: null };
  let nearest = Number.MIN_VALUE;
  for (const option of options) {
    let current_desire = option.desire;
    let current_score = averageScore(option.args, current_desire);
    if (current_score > nearest) {
      best_option = { desire: option.desire, args: option.args }
      nearest = current_score;
    }
  }

  console.log("best option: " + best_option.desire + " " + best_option.args);
  // if best option parcel is already in the queue, remove the old one and add the new one
  if (best_option.desire != null) myAgent.queue(best_option.desire, best_option.args);
}
client.onParcelsSensing(options);

class Agent {
  intention_queue = new Array();

  async intentionLoop() {
    while (true) {
      //check if the current intention is still valid
      const intention = this.intention_queue.shift();
      if (intention) await intention.achieve();
      await new Promise((res) => setImmediate(res));
    }
  }

  async queue(desire, args) {
    this.intention_queue.push(new Intention(desire, args));
  }

  async stop() {
    console.log("stop agent queued intentions");
    for (const intention of this.intention_queue) {
      intention.stop();
    }
  }
}
const myAgent = new Agent();
myAgent.intentionLoop();

async function moveToTarget(actions) {
  if (actions.length == 0) return false;
  var actionsDone = [actions.length];

  switch (actions[0]) {
    case "pickup":
      actionsDone[0] = await client.pickup();
      break;
    case "putdown":
      actionsDone[0] = await client.putdown();
      break;
    default:
      actionsDone[0] = await client.move(actions[0]);
      break;
  }

  for (var i = 1; i < actions.length; i++) {
    if (actionsDone[i - 1]) {
      switch (actions[i]) {
        case "pickup":
          actionsDone[i] = await client.pickup();
          break;
        case "putdown":
          actionsDone[i] = await client.putdown();
          break;
        default:
          actionsDone[i] = await client.move(actions[i]);
          break;
      }
    }
  }

  return true;
}

class Intention extends Promise {
  #current_plan;
  stop() {
    console.log('stop intention and current plan');
    this.#current_plan.stop();
  }

  #desire;
  #args;

  #resolve;
  #reject;

  constructor(desire, args) {
    var resolve, reject;
    super(async (res, rej) => {
      resolve = res; reject = rej;
    })
    this.#resolve = resolve
    this.#reject = reject
    this.#desire = desire;
    this.#args = args;
  }

  #started = false;
  async achieve() {
    if (this.#started)
      return this;
    else
      this.#started = true;

    var goal = goalParser(this.#desire, this.#args, me.id);
    var plan = await planner(parcels, agents, me, goal);
    console.log('plan: ', plan);
    try {
      const plan_res = await moveToTarget(plan);
      this.#resolve(plan_res);
      console.log('plan', plan, 'succesfully achieved');
      return plan_res
    } catch (error) {
      console.log('plan', plan, 'failed while trying to achieve');
    }

    this.#reject();
    throw 'no plan satisfied the desire ' + this.#desire;
  }
}