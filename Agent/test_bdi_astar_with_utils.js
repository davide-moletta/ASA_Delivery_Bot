import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import {getMovements, findDeliveryPoint} from "./astar_utils.js";
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
});
setTimeout(() => {}, 1000);


function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
  const dx = Math.abs(Math.round(x1) - Math.round(x2));
  const dy = Math.abs(Math.round(y1) - Math.round(y2));
  return dx + dy;
}

/**
 * Belief revision function
 */

const me = {};
client.onYou(({ id, name, x, y, score }) => {
  me.id = id;
  me.name = name;
  me.x = x;
  me.y = y;
  me.score = score;
});
const parcels = new Map();
client.onParcelsSensing(async (perceived_parcels) => {
  for (const p of perceived_parcels) {
    parcels.set(p.id, p);
  }
});

function agentLoop() {
  const options = [];
  for (const parcel of parcels.values())
    if (!parcel.carriedBy)
      options.push({ desire: "go_pick_up", args: [parcel] });

  for (const parcel of parcels.values()) {
    if (parcel.carriedBy) {
      console.log(me.x, me.y)
      let deliver = findDeliveryPoint(me.x, me.y, delivery_points);
      console.log(deliver);
      options.push({ desire: "go_put_down", args: [deliver] });
    }
  }

  let best_option;
  let nearest = Number.MAX_VALUE;
  for (const option of options) {
    let current_i = option.desire;
    let current_d = distance(option.args[0], me);
    if (current_i == "go_pick_up" && current_d < nearest) {
      best_option = option;
      nearest = distance(option.args[0], me);
    }
  }

  if (best_option) myAgent.queue(best_option.desire, ...best_option.args);
}
client.onParcelsSensing(agentLoop);

class Agent {
  intention_queue = new Array();

  async intentionLoop() {
    while (true) {
      const intention = this.intention_queue.shift();
      if (intention) await intention.achieve();
      await new Promise((res) => setImmediate(res));
    }
  }

  async queue(desire, ...args) {
    const last = this.intention_queue.at(this.intention_queue.length - 1);
    const current = new Intention(desire, ...args);
    this.intention_queue.push(current);
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

class Intention extends Promise {
  #current_plan;
  stop() {
    console.log("stop intention and current plan");
    this.#current_plan.stop();
  }

  #desire;
  #args;

  #resolve;
  #reject;

  constructor(desire, ...args) {
    var resolve, reject;
    super(async (res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.#resolve = resolve;
    this.#reject = reject;
    this.#desire = desire;
    this.#args = args;
  }

  #started = false;
  async achieve() {
    if (this.#started) return this;
    else this.#started = true;

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
          const plan_res = await plan.execute(...this.#args);
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

/**
 * Plan library
 */
const plans = [];

class Plan {
  stop() {
    console.log("stop plan and all sub intentions");
    for (const i of this.#sub_intentions) {
      i.stop();
    }
  }

  #sub_intentions = [];

  async subIntention(desire, ...args) {
    const sub_intention = new Intention(desire, ...args);
    this.#sub_intentions.push(sub_intention);
    return await sub_intention.achieve();
  }
}

class GoPickUp extends Plan {
  isApplicableTo(desire) {
    return desire == "go_pick_up";
  }

  async execute({ x, y }) {
    await this.subIntention("go_to", { x, y });
    await client.pickup();

    // now go put down to deliver
    const deliver = findDeliveryPoint(x, y, delivery_points);
    
    const sub_intentionx = new Intention("go_put_down", { x: deliver[0], y: deliver[1] });
    await sub_intentionx.achieve();
    
  }
}

class GoPutDown extends Plan {
  isApplicableTo(desire) {
    return desire == "go_put_down";
  }

  async execute({ x, y }) {
    await this.subIntention("go_to", { x, y });
    await client.putdown();
  }
}

async function moveToTarget(movs) {
  var movemementsDone = [movs.length];

  movemementsDone[0] = await client.move(movs[0]);
  for (var i = 1; i < movs.length; i++) {
    if (movemementsDone[i - 1]) {
      movemementsDone[i] = await client.move(movs[i]);
    }
  }
}

class BlindMove extends Plan {
  isApplicableTo(desire) {
    return desire == "go_to";
  }

  async execute({ x, y }) {
    await moveToTarget(getMovements(me.x, me.y, x, y, mapData, maxX, maxY));
  }
}

plans.push(new GoPickUp());
plans.push(new BlindMove());
plans.push(new GoPutDown());