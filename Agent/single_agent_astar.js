import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { getMovements, findDeliveryPoint } from "./utils/astar_utils.js";
const client = new DeliverooApi(
  "http://localhost:8080/?name=Cannarsi",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5ZDBiMDA0NDdlIiwibmFtZSI6IkNhbm5hcnNpIiwiaWF0IjoxNjgyMDk4NTI0fQ.juYE2bZS6jm8ghTqrpfheFSVSjpIz_C1s-bPIj4LN1w"
);

// TODO:
// - pickup and putdown during a plan
// - update metrics based on the server values
// - understand why some elements remain in the queue

const GO_PUT_DOWN = "go_put_down";
const GO_PICK_UP = "go_pick_up";
const GO_TO = "go_to";
const MILLIS_TO_DROP = 1000*10;

let maxX = 0;
let maxY = 0;
var mapData; // the map as a 2D array
const delivery_points = [];

const support_memory = new Map(); // it will contain parcels ids as key, the timestamp of when the intent was created

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

  if (action == GO_PICK_UP) {
    //The possible score is the actual score of the parcels that I'm carrying - the distance from me to the parcel I want to pickup * the number of parcels that I'm carrying
    //This is to calculate the average score that I can have once i reach the target parcel
    //Plus the value of the target parcel - the distance to calculate the value of the parcel once I reach it
    return (actualScore + parcelValue) - ((parcelsToDeliver + 1) * distance);
  }
  if (action == GO_PUT_DOWN) {
    if (parcelsToDeliver == 0) {
      return MIN_VALUE;
    }
    //The possible score is the actual score of the parcels that I'm carrying - the distance from me to the closest delivery point * the number of parcels that I'm carrying
    //This is to calculate the average score that I can have once i reach the delivery point
    console.log("parcel len" + parcels.size)
    return actualScore - (parcelsToDeliver * distance)+10*parcels.size;
  }
}


function agentLoop() {
  const options = [];
  for (const parcel of parcels.values()) {
    const current_time = new Date().getTime();
    if (!parcel.carriedBy) {
      let pickup = { x: parcel.x, y: parcel.y};
      options.push({ desire: GO_PICK_UP, args: [pickup, parcel.id] });
      support_memory.set(parcel.id, [current_time, GO_PICK_UP]);
    } else if (parcel.carriedBy == me.id) {
      let delivery = findDeliveryPoint(me.x, me.y, delivery_points)
      options.push({ desire: GO_PUT_DOWN, args: [delivery, parcel.id] });
      support_memory.set(parcel.id, [current_time, GO_PUT_DOWN]);
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
  if (best_option.desire != null) myAgent.queue(best_option.desire, ...best_option.args);
}
client.onParcelsSensing(agentLoop);

class Agent {
  intention_queue = new Array();

  async intentionLoop() {
    while (true) {
      const intention = this.intention_queue.shift();
      // console.log("intention: " + intention);
      if (intention) await intention.achieve();
      await new Promise((res) => setImmediate(res));
    }
  }

  async queue(desire, ...args) {
    // args are in the form args: [object Object],p71
    // we need to extract the parcel id from the args
    
    const [coordinate, parcel_id] = args;
    // for(const intention of this.intention_queue){
      // if(intention.args[1] == parcel_id){
      //   // we remove the old intention from this.intention_queue
      //   console.log("REMOVE old intention from queue");
      //   this.intention_queue.splice(this.intention_queue.indexOf(intention), 1); 
      // }
    // }

    // if parcel_id is not null and in the intention queue, we remove the old intention from this.intention_queue
    if(parcel_id != null){
      for(const intention of this.intention_queue){
        if(intention.getId() == parcel_id && intention.getDesire() == desire){
          // we remove the old intention from this.intention_queue
          console.log("REMOVE old intention from queue");
          this.intention_queue.splice(this.intention_queue.indexOf(intention), 1);
        }
      }
    }
    const current = new Intention(desire, ...args);
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
    const support_memory_entry = support_memory.get(parcel_id);
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

  async execute(...args) {
    await this.subIntention(GO_TO, args);
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
    return desire == GO_PUT_DOWN;
  }

  async execute(...args) {
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

  async execute(...args) {
    console.log("blind move to", args);
    if(args[0][0].x != me.x || args[0][0].y != me.y) 
      await moveToTarget(getMovements(me.x, me.y, args[0][0].x, args[0][0].y, mapData, maxX, maxY));
  }
}

async function moveToTarget(movs) {
  if(movs.length == 0) return;
  var movemementsDone = [movs.length];

  movemementsDone[0] = await client.move(movs[0]);
  for (var i = 1; i < movs.length; i++) {
    
    if (movemementsDone[i - 1]) {
      movemementsDone[i] = await client.move(movs[i]);
    }
  }
}



plans.push(new GoPickUp());
plans.push(new BlindMove());
plans.push(new GoPutDown());