import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
import { getMovements, findDeliveryPoint } from "./astar_utils.js";
import { default as config_multi } from "./config_multi.js";
import { divideMatrix } from "./map_utils_playground.js";

const clients = [
  new DeliverooApi(config_multi.host1, config_multi.token1),
  new DeliverooApi(config_multi.host2, config_multi.token2),
  new DeliverooApi(config_multi.host3, config_multi.token3),
  new DeliverooApi(config_multi.host4, config_multi.token4),
];

const GO_PUT_DOWN = "go_put_down";
const GO_PICK_UP = "go_pick_up";
const GO_TO = "go_to";
const MILLIS_TO_DROP = 1000*10;

let maxX = 0;
let maxY = 0;
var mapData; // the map as a 2D array
var center_spots;
var slices_res;
const delivery_points = [];
const support_memory = new Array(clients.length).fill(0).map(() => new Map());

clients[0].onMap((width, height, tiles) => {
  maxX = width;
  maxY = height;

  mapData = new Array(maxX).fill(0).map(() => new Array(maxY).fill(0));
  [center_spots, slices_res] = divideMatrix(new Array(maxX).fill(99).map(() => new Array(maxY).fill(99)), clients.length, false, true);

  tiles.forEach((tile) => {
    mapData[tile.x][tile.y] = tile.delivery ? 2 : 1;
    if (tile.delivery) {
      delivery_points.push([tile.x, tile.y]);
    }
  });
});
await timer(1000);

console.log(mapData)
const slices_delivery = new Array(clients.length).fill(0).map(() => new Array());
// slices_delivery = for each slice in slice_res, add the delivery points in the slice
for(const slice of slices_res) {
  for (const point of slice){
    if (point in delivery_points) {
      slices_delivery[slices_res.indexOf(slice)].push(point);
    }
  }
}

/**
 * Belief revision function
 */

const me = new Array(clients.length);
const parcels = new Array(clients.length).fill(0).map(() => new Map());
for (const client of clients) {
  client.onYou(({ id, name, x, y, score }) => {
    me[clients.indexOf(client)] = new Object();
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
  });
  client.onParcelsSensing(async (perceived_parcels) => {
    for (const p of perceived_parcels) {
      if([p.x, p.y] in slices_delivery[clients.indexOf(client)]){
      parcels[clients.indexOf(client)].set(p.id, p);
    }
  }
  });
}

function averageScore({ x: targetX, y: targetY }, action) {
  // var actualScore = 0;
  // var parcelsToDeliver = 0;
  // var parcelValue = 0;
  // var distance = Math.abs(Math.round(targetX) - Math.round(me.x)) + Math.abs(Math.round(targetY) - Math.round(me.y));

  // for (const parcel of parcels.values()) {
  //   if (parcel.carriedBy == me.id) {
  //     actualScore += parcel.reward;
  //     parcelsToDeliver++;
  //   }
  //   if (parcel.x == targetX && parcel.y == targetY) {
  //     parcelValue = parcel.reward;
  //   }
  // }

  // if (action == GO_PICK_UP) {
  //   return (actualScore + parcelValue) - ((parcelsToDeliver + 1) * distance);
  // }
  // if (action == GO_PUT_DOWN) {
  //   if (parcelsToDeliver == 0) {
  //     return MIN_VALUE;
  //   }
  //   return actualScore - (parcelsToDeliver * distance)+10*parcels.size;
  // }
  return 15;
}



function agentLoop(index) {
  const options = [];
  for (const parcel of parcels.values()) {
    const current_time = new Date().getTime();
    if (!parcel.carriedBy) {
      let pickup = { x: parcel.x, y: parcel.y};
      options.push({ desire: GO_PICK_UP, args: [pickup, parcel.id] });
      support_memory[index].set(parcel.id, [current_time, GO_PICK_UP]);
    } else if (parcel.carriedBy == me.id) {
      let delivery = findDeliveryPoint(me.x, me.y, delivery_points)
      options.push({ desire: GO_PUT_DOWN, args: [delivery, parcel.id] });
      support_memory[index].set(parcel.id, [current_time, GO_PUT_DOWN]);
    }
  }


  let best_option = {desire: null, args: null};
  let nearest = Number.MIN_VALUE;
  for (const option of options) {
    let current_desire = option.desire;
    let current_score = averageScore(option.args[0], current_desire);
    if (current_score > nearest) {
      best_option = {desire:option.desire, args: option.args}
      nearest = current_score;
    }
  }
 // if best option parcel is already in the queue, remove the old one and add the new one
  
  if (best_option.desire != null) myAgents[index].queue(best_option.desire, ...best_option.args);
}

// TODO: implement multi-agent from here
class Intention extends Promise {
  #current_plan;
  stop() {
    console.log("stop intention and current plan");
    this.#current_plan.stop();
  }

  #desire;
  #args;
  #client;
  #resolve;
  #reject;

  constructor(desire, client, ...args) {
    var resolve, reject;
    super(async (res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.#resolve = resolve;
    this.#reject = reject;
    this.#desire = desire;
    this.#args = args;
    this.#client = client
  }

  getId() {
    return this.#args[1];
  }

  getDesire() {
    return this.#desire;
  }

  #started = false;
  async achieve() {
    if (this.#started) return this;
    else this.#started = true;

    // check the timestamp in the support memory
    const parcel_id = this.#args[1];
    //console.log("parcel id: " + parcel_id);
    const current_time = new Date().getTime();
    const support_memory_entry = support_memory[clients.indexOf(this.client)].get(parcel_id);
    //console.log("support memory entry: " + support_memory_entry);
    if (support_memory_entry) {
      const [timestamp, desire] = support_memory_entry;
      const offset = current_time - timestamp;
      if (offset > MILLIS_TO_DROP) {
        console.log("dropping intention, too old", this);
        try {
          this.#reject("dropping intention, too old");
        }
        catch (error) {
          console.log("error while rejecting intention", error);
        }
      }
    }

    for (const plan of plans) {
      if (plan.isApplicableTo(this.#desire)) {
        this.#current_plan = plan;
        console.log(
          "achieving desire",
          this.#desire,
          ...this.#args,
          "with plan",
          plan
        );
        try {
          const plan_res = await plan.execute(this.#client, ...this.#args);
          this.#resolve(plan_res);
          console.log(
            "plan",
            plan,
            "succesfully achieved intention",
            this.#desire,
            ...this.#args,
            "with result",
            plan_res
          );
          // remove plan from plans
          //plans.splice(plans.indexOf(plan), 1);
          return plan_res;
        } catch (error) {
          console.log(
            "plan",
            plan,
            "failed while trying to achieve intention",
            this.#desire,
            ...this.#args,
            "with error",
            error
          );
        }
      }
    }

    this.#reject();
    console.log("no plan satisfied the desire ", this.#desire, ...this.#args);
    throw "no plan satisfied the desire " + this.#desire;
  }
}


class Agent {
  intention_queue = new Array();
  constructor(client) {
    this.client = client;
  }

  async intentionLoop() {
    while (true) {
      const intention = this.intention_queue.shift();
      // console.log("intention: " + intention);
      if (intention) await intention.achieve();
      await new Promise((res) => setImmediate(res));
    }
  }

  async queue(desire, ...args) {
    const [coordinate, parcel_id] = args;
    if(parcel_id != null){
      for(const intention of this.intention_queue){
        if(intention.getId() == parcel_id && intention.getDesire() == desire){
          // we remove the old intention from this.intention_queue
          console.log("REMOVE old intention from queue");
          this.intention_queue.splice(this.intention_queue.indexOf(intention), 1);
        }
      }
    }
    const current = new Intention(desire, this.client, ...args);
    console.log("queue intention: " + desire);
    this.intention_queue.push(current);
  }

  async stop() {
    console.log("stop agent queued intentions");
    for (const intention of this.intention_queue) {
      intention.stop();
    }
  }
}
// create an array of agents passing the index on the new Agent
const myAgents = new Array(clients.length)
for (const client of clients) {
  myAgents[clients.indexOf(client)] = new Agent(clients[clients.indexOf(client)]);
}
for (const agent of myAgents) {
  //agent = new Agent(clients[myAgents.indexOf(agent)]);
  agent.intentionLoop();
}
console.log(myAgents[0])
for (const client of clients) {
  client.onParcelsSensing(agentLoop(clients.indexOf(client)));
  }
  



/**
 * Plan library
 */

class Plan {
  stop() {
    console.log("stop plan and all sub intentions");
    for (const i of this.#sub_intentions) {
      i.stop();
    }
  }

  #sub_intentions = [];

  async subIntention(desire, args) {
    const sub_intention = new Intention(desire, args);
    this.#sub_intentions.push(sub_intention);
    return await sub_intention.achieve();
  }
}

class GoPickUp extends Plan {
  isApplicableTo(desire) {
    return desire == GO_PICK_UP;
  }

  async execute(client, ...args) {
    await this.subIntention(GO_TO, args);
    await client.pickup();
    return true;

  }
}

class GoPutDown extends Plan {
  isApplicableTo(desire) {
    return desire == GO_PUT_DOWN;
  }

  async execute(client,...args) {
    console.log("go put down", args);
    await this.subIntention(GO_TO, args);
    // remove the parcel from the parcels map
    const parcel_id = args[1];
    parcels.delete(parcel_id);

    await client.putdown();

  }
}

class BlindMove extends Plan {
  isApplicableTo(desire) {
    return desire == GO_TO;
  }

  async execute(client, ...args) {
    console.log("blind move to", args);
    if(args[0][0].x != me[clients.indexOf(client)].x || args[0][0].y != me[clients.indexOf(client)].y) 
      await moveToTarget(getMovements(me[clients.indexOf(client)].x, me[clients.indexOf(client)].y, args[0][0].x, args[0][0].y, mapData, maxX, maxY));
  }
}

async function moveToTarget(movs, client) {
  if(movs.length == 0) return;
  var movemementsDone = [movs.length];

  movemementsDone[0] = await client.move(movs[0]);
  for (var i = 1; i < movs.length; i++) {
    
    if (movemementsDone[i - 1]) {
      movemementsDone[i] = await client.move(movs[i]);
    }
  }
}

const plans = new Array(clients.length);
for(var plan of plans) {
  plan = []
  plan.push(new GoPickUp());
  plan.push(new BlindMove());
  plan.push(new GoPutDown());
}

