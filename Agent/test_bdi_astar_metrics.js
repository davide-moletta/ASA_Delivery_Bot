import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { getMovements, findDeliveryPoint } from "./astar_utils.js";
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
setTimeout(() => { }, 1000);


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

function averageScore({ x: targetX, y: targetY }, action) {
  var actualScore = 0;
  var parcelsToDeliver = 0;
  var parcelValue = 0;
  var distance = Math.abs(Math.round(targetX) - Math.round(me.x)) + Math.abs(Math.round(targetY) - Math.round(me.y));

  for (const parcel of parcels.values()) {
    if (parcel.carriedBy == me.id) {
      actualScore += parcel.reward;
      parcelsToDeliver++;
    }
    if (parcel.x == targetX && parcel.y == targetY) {
      parcelValue = parcel.reward;
    }
  }

  if (action == 'go_pick_up') {
    //The possible score is the actual score of the parcels that I'm carrying - the distance from me to the parcel I want to pickup * the number of parcels that I'm carrying
    //This is to calculate the average score that I can have once i reach the target parcel
    //Plus the value of the target parcel - the distance to calculate the value of the parcel once I reach it
    return (actualScore + parcelValue) - ((parcelsToDeliver + 1) * distance);
  }
  if (action == 'go_put_down') {
    if (parcelsToDeliver == 0) {
      return MIN_VALUE;
    }
    //The possible score is the actual score of the parcels that I'm carrying - the distance from me to the closest delivery point * the number of parcels that I'm carrying
    //This is to calculate the average score that I can have once i reach the delivery point
    return actualScore - (parcelsToDeliver * distance);
  }
}

function print(str) {
  console.log(str);
}

function agentLoop() {
  const options = [];
  for (const parcel of parcels.values()) {
    if (!parcel.carriedBy) {
      let pickup = { x: parcel.x, y: parcel.y, id: parcel.id};
      options.push({ desire: 'go_pick_up', args: [pickup] });
    } else if (parcel.carriedBy == me.id) {
      let delivery = findDeliveryPoint(me.x, me.y, delivery_points)
      print(delivery + "sono da consegnare kebabo")
      options.push({ desire: 'go_put_down', args: [delivery] });
    }
  }


  let best_option = {id: null, desire: null, args: null};
  let nearest = Number.MIN_VALUE;
  for (const option of options) {
    let current_i = option.desire;
    let current_score = averageScore(option.args[0], current_i);
    if (current_score > nearest) {
      console.log(current_i)
      if(current_i == "go_put_down"){
        console.log("SONO DENTRO")
        best_option = {id: "1", desire: option.desire, args: option.args}
      }else{
        best_option = {id: option.args[0].id, desire:option.desire, args: option.args}
      }
      nearest = current_score;
    }
  }
 // if best option parcel is already in the queue, remove the old one and add the new one
  if (best_option.id != null) myAgent.queue(best_option.desire, best_option.id, ...best_option.args);
}
client.onParcelsSensing(agentLoop);

class Agent {
  intention_queue = new Array();

  async intentionLoop() {
    while (true) {
      const intention = this.intention_queue.shift();
      console.log("intention: " + intention);
      if (intention) await intention.achieve();
      await new Promise((res) => setImmediate(res));
    }
  }

  async queue(desire, id, ...args) {
    console.log("queue intention: " + desire + " " + id);
    for(const intention of this.intention_queue){
      if(intention.id == id){ 
          this.intention_queue.splice(this.intention_queue.indexOf(intention), 1);
          return;
      }
    }
    const last = this.intention_queue.at(this.intention_queue.length - 1);
    const current = new Intention(desire, id, ...args);
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
  #id;

  #resolve;
  #reject;

  constructor(desire, id, ...args) {
    var resolve, reject;
    super(async (res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.#resolve = resolve;
    this.#reject = reject;
    this.#desire = desire;
    this.#args = args;
    this.#id = id;
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
          const plan_res = await plan.execute(this.#id, ...this.#args);
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

  async subIntention(desire, id, ...args) {
    const sub_intention = new Intention(desire, id, ...args);
    this.#sub_intentions.push(sub_intention);
    return await sub_intention.achieve();
  }
}

class GoPickUp extends Plan {
  isApplicableTo(desire) {
    return desire == "go_pick_up";
  }

  async execute(id, { x, y }) {
    await this.subIntention("go_to", id, { x, y });
    await client.pickup();
    return true;

    // now go put down to deliver
    // const deliver = findDeliveryPoint(x, y, delivery_points);

    // const sub_intentionx = new Intention("go_put_down", { x: deliver[0], y: deliver[1] });
    // await sub_intentionx.achieve();

  }
}

class GoPutDown extends Plan {
  isApplicableTo(desire) {
    return desire == "go_put_down";
  }

  async execute(id, { x, y }) {
    await this.subIntention("go_to", id, { x, y });
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

  async execute(id, { x, y }) {
    await moveToTarget(getMovements(me.x, me.y, x, y, mapData, maxX, maxY));
  }
}

plans.push(new GoPickUp());
plans.push(new BlindMove());
plans.push(new GoPutDown());