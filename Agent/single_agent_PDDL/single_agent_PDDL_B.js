import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { planner, goalParser, mapParser, readDomain } from "./test_PDDL_moletta.js";
import { findDeliveryPoint } from ".././utils/astar_utils.js";

const client = new DeliverooApi(
  "http://localhost:8080/?name=Zeb89",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjljYzkwMmU3ZDQ3IiwibmFtZSI6IlplYjg5IiwiaWF0IjoxNjg4NDgzNDg1fQ.7Ma9uLSiA1_6AG4M37O8QPPVKU2UwCADUboa5cnnUeU"
);

// TODO:
// - add memory
// - optimize the code (local planner)
// - probability model to foresee agents movements
// - fix the bug that make the agent loops and say intention stopped (if plan is created and then environment changes i think)

// - plan of the professor:
// - 1) sense the environment and create beliefs
// - 2) revise beliefs
// - 3) send beliefs to the intention rules and filter them
// - 4) create the intentions
// - 5) revise intentions
// - 6) select the correct plan from the plan library
// - 7) revise the plan
// - 8) execute the plan
// - 9) archive the plan (to avoid re-planning)

const GO_PUT_DOWN = "go_put_down";
const GO_PICK_UP = "go_pick_up";
const BLIND_MOVE = "blind_move";

let maxX = 0;
let maxY = 0;
var mapData;
const delivery_points = [];

const plans = [];
var supportMemory = new Map();

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
  //Once the map is complete calls the function to save the string of the map as a PDDL problem
  mapParser(mapData);
});
//Get the configuration from the server to get values used to perform score evaluation
const config = new Map();
client.onConfig((conf) => {
  config.set("parGenInt", conf.PARCELS_GENERATION_INTERVAL.split("s")[0] * 1000); //Parcel generation interval in milliseconds (not used)
  config.set("moveDur", conf.MOVEMENT_DURATION); //Movement duration in milliseconds
  config.set("ageObsDist", conf.AGENTS_OBSERVATION_DISTANCE); //Agent observation distance (not used)
  config.set("parObsDist", conf.PARCELS_OBSERVATION_DISTANCE); //Parcel observation distance
  config.set("parRewAvg", conf.PARCEL_REWARD_AVG); //Parcel reward average (not used)
  config.set("parRewVar", conf.PARCEL_REWARD_VARIANCE); //Parcel reward variance (not used)
  if (conf.PARCEL_DECADING_INTERVAL == "infinite") {
    config.set("parDecInt", "infinite") //Parcel decading interval infinite
  } else {
    config.set("parDecInt", conf.PARCEL_DECADING_INTERVAL.split("s")[0] * 1000); //Parcel decading interval in milliseconds
  }
  config.set("clock", conf.CLOCK * 5); //Clock interval in milliseconds (not used)
});
setTimeout(() => { }, 1000);

//Read the PDDL domain from the file
readDomain();

const me = {};
client.onYou(({ id, x, y }) => {
  me.id = id;
  me.x = x;
  me.y = y;
});

// DUPLICATE THE FILE
//
// ----------- BASIC -----------
//TODO: call other agent to share the ID: if the other agent is not present, wait for it to be present
// if my ID < other ID, i'm the number 0, otherwise i'm the number 1
// call slice function to get the my slice of the map
// edit blind move to go only in my slice
// 
// ASK FUNCTION for the ID (also SHOUT if #agents > 2)
// SAY FUNCTION for the parcel location
// ----------- MEDIUM -----------
//TODO: duplicate the file. Enable the communication with the other agent
// when going for a parcel, ask if the expected return if they are going to pick it up:
// if theirs is higher, drop the plan and go for another parcel
// a: "My er is 200, what is yours?"
// b: "Mine is 300" -> drop the plan
// b: "Mine is 100" -> execute the plan
//
// SHOUT FUNCTION to ask for the expected return
// REPLY FUNCTION to say "Okay I go, remove it from your list"


var parcels = new Map();
client.onParcelsSensing(async (perceived_parcels) => {
  for (const p of perceived_parcels) {
    parcels = new Map();
    p.x = Math.round(p.x);
    p.y = Math.round(p.y);
    parcels.set(p.id, p);
    //TODO: if parcel is in my slice, add it, otherwise send message to the other agent about it
  }
});

const agents = new Map();
client.onAgentsSensing(async (perceived_agents) => {
  for (const a of perceived_agents) {
    a.x = Math.round(a.x);
    a.y = Math.round(a.y);
    agents.set(a.id, a);
  }
});

//Generate and return random coordinates with higher probability for further positions
function weightedBlindMove(agentPosition) {
  //Create an offset to avoid cells in the FOV of the agent
  const offset = Math.ceil(config.get("parObsDist") / 2);

  var weigth;

  //Calculate the distances from the agent to each coordinate
  const distances = [];
  for (let i = offset; i < maxX - offset; i++) {
    for (let j = offset; j < maxY - offset; j++) {
      //If the point is not walkable skip it
      if (mapData[j][i] == 0) continue;

      //Calculate the distance from the agent and if it is less than the observation distance skip it (i'm seeing it)
      var distance = Math.abs(agentPosition.x - j) + Math.abs(agentPosition.y - i);
      if (distance < offset) continue;

      //Push the coordinates in the array with a number of repetitions based on the distance/5

      weigth = distance / 5;
      for (let k = 0; k < weigth; k++) {
        distances.push({ x: j, y: i, score: Number.MIN_VALUE });
      }
    }
  }

  //If there are no points in the distances array return a random walkable point (this should never happen)
  //CAN LOOP FIX
  if (distances.length == 0) {
    var targetX = 0;
    var targetY = 0;
    do {
      targetX = Math.floor(Math.random() * maxX);
      targetY = Math.floor(Math.random() * maxY);
    } while (mapData[targetX][targetY] == 0);

    return { x: targetX, y: targetY, score: Number.MIN_VALUE };
  }

  //Sort the coordinates randomly and return a random one
  distances.sort(() => Math.random() - 0.5);
  return distances[Math.floor(Math.random() * distances.length)];
}

//Calculate an ideal score based on the beliefs of the agent to select the best option
function averageScore(args, desire, actualScore, parcelsToDeliver) {
  if (desire == GO_PICK_UP) {
    var distance = Math.abs(Math.round(args.x) - Math.round(me.x)) + Math.abs(Math.round(args.y) - Math.round(me.y));

    //If there is no decaying time prioritize picking up parcels (the one to be picked up will be the closest one)
    if (config.get("parDecInt") == 'infinite') return (1500 - distance);

    //If the decaying time is not infinite, the score to pick up a parcel is the actual score plus the reward of the parcel
    //minus the number of parcels to deliver plus the one we want to pick up multiplied by the time required to make a move times the distance to reach the parcel 
    //divided by the parcel decaying time
    return ((actualScore + args.reward) - (((parcelsToDeliver + 1) * (config.get("moveDur") * distance)) / config.get("parDecInt")));
  }
  if (desire == GO_PUT_DOWN) {
    //Find closest delivery point and calculate the distance from it
    var closestDelivery = findDeliveryPoint(me.x, me.y, delivery_points);
    var distance = Math.abs(Math.round(closestDelivery.x) - Math.round(me.x)) + Math.abs(Math.round(closestDelivery.y) - Math.round(me.y));

    //If the parcel decaying time is infinite and the distance is less than 4 prioritize delivering the parcel otherwise prioritize picking up parcels
    if (config.get("parDecInt") == 'infinite') {
      // if move duration is below 50, MAX_PARCEL_ON_HEAD is 30, if between 50 and 200 it is 20, if above 200 it is 10
      const MAX_PARCEL_ON_HEAD = config.get("moveDur") <= 50 ? 30 : config.get("moveDur") <= 200 ? 20 : 10;
      // if move duration is below 50, MIN_DISTANCE is 2, if between 50 and 200 it is 4, if above 200 it is 5
      const MIN_DISTANCE = config.get("moveDur") <= 50 ? 2 : config.get("moveDur") <= 200 ? 2 : 2;
      if (parcelsToDeliver >= MAX_PARCEL_ON_HEAD || distance < MIN_DISTANCE) {
        return Number.MAX_VALUE;
      } else {
        return 500;
      }
    }

    //If the parcel decaying time is not infinite, the score to deliver the parcels is the actual score plus the actual score divided by ten
    //minus the number of parcels to deliver multiplied by the time required to make a move times the distance from the delivery point 
    //divided by the parcel dacaying time
    const BONUS = actualScore / 10;
    return ((actualScore + BONUS) - (parcelsToDeliver * (config.get("moveDur") * distance) / config.get("parDecInt")));
  }
}

//Check the environment to search for the best possible action to take
async function checkOptions() {
  const options = [];
  const deliveries = [];
  var actualScore = 0;
  var parcelsToDeliver = 0;
  var best_option;

  if (parcels.length != 0) {
    //For each parcel checks if it is carryed by the agent or not and adds the option to pick it up or put it down
    for (const parcel of parcels.values()) {
      if (!parcel.carriedBy) {
        options.push({ desire: GO_PICK_UP, args: { id: parcel.id, x: parcel.x, y: parcel.y, reward: parcel.reward, score: 0 } });
      } else if (parcel.carriedBy == me.id) {
        actualScore += parcel.reward;
        parcelsToDeliver++;
        deliveries.push(parcel);
      }
    }
    if (parcelsToDeliver != 0) options.push({ desire: GO_PUT_DOWN, args: { deliveries: deliveries, score: 0 } });

    //Check all the options to find the best one
    best_option = { desire: null, args: null };
    let best_score = Number.MIN_VALUE;
    var bestIndex = 0;
    var metrics
    var decay_time = config.get("parDecInt") == 'infinite' ? 1 : config.get("parDecInt");

    for (var i = 0; i < options.length; i++) {
      let current_score = averageScore(options[i].args, options[i].desire, actualScore, parcelsToDeliver);
      options[i].args.score = current_score;

      if (current_score > best_score) {
        best_option = { desire: options[i].desire, args: options[i].args }
        // compute the metrics by takeing the current time in millis + the parcel value multiplied by the decading time + the move time * distance, to later check if current time < metrics
        if (options[bestIndex].desire == GO_PICK_UP) {
          metrics = performance.now() + (options[bestIndex].args.reward * decay_time);
          supportMemory.set(options[bestIndex].desire + "-" + options[bestIndex].args.id, { desire: options[bestIndex].desire, args: options[bestIndex].args, time: metrics });
        }
        else if (options[bestIndex].desire == GO_PUT_DOWN) {
          metrics = performance.now() + parcelsToDeliver * decay_time * actualScore
          supportMemory.set(options[bestIndex].desire, { desire: options[bestIndex].desire, args: options[bestIndex].args, time: metrics });
        }
        best_score = current_score;
        bestIndex = i;
      } else {
        if (options[i].desire == GO_PICK_UP) {
          metrics = performance.now() + (options[i].args.reward * decay_time);
          supportMemory.set(options[i].desire + "-" + options[i].args.id, { desire: options[i].desire, args: options[i].args, time: metrics });
        }
        else if (options[i].desire == GO_PUT_DOWN) {
          metrics = performance.now() + parcelsToDeliver * decay_time * actualScore
          supportMemory.set(options[i].desire, { desire: options[i].desire, args: options[i].args, time: metrics });
        }
      }
    }
  } else {
    best_option = { desire: BLIND_MOVE, args: weightedBlindMove({ x: me.x, y: me.y }) };
  }

  if (best_option.desire == null) {
    best_option = { desire: BLIND_MOVE, args: weightedBlindMove({ x: me.x, y: me.y }) };
  } else {
    if (myAgent.getCurrentDesire() != null) {
      myAgent.intentionReplace(best_option.desire, best_option.args)
    }
  }

  //The best option is added to the intention queue
  myAgent.queue(best_option.desire, best_option.args);
}
//client.onParcelsSensing(checkOptions);
setInterval(async function () {
  await checkOptions();
}, 50);//config.get("clock"));

class Agent {
  intention_queue = new Array();
  current_intention

  //The loop that runs the intentions
  async intentionLoop() {

    while (true) {
      await this.intentionRevision();
      //Peek the first intention and removes it from the queue only after it is achieved or rejected to enable stop option
      const intention = this.intention_queue[0];

      if (intention) {
        this.current_intention = intention;
        try {
          await intention.achieve();
          
        } catch (e) {
          console.log(e);
        }
        this.intention_queue.shift();
      }
      await new Promise((res) => setImmediate(res));
    }
  }

  //Reset the current intention when the agent completes it
  resetCurrentIntention() {
    this.current_intention = new Intention(null, null);
  }

  getCurrentDesire() {
    if (this.current_intention) return this.current_intention.getDesire();
    else return null;
  }

  async intentionRevision() {
    if (supportMemory.size == 0) {
      return true;
    }

    //Calculate the actual score and the parcels to deliver
    var actualScore = 0;
    var parcelsToDeliver = 0;
    for (const parcel of parcels.values()) {
      if (parcel.carriedBy == me.id) {
        actualScore += parcel.reward;
        parcelsToDeliver++;
      }
    }

    //Best option in memory
    var best_option_memory = { desire: null, args: null };
    var best_score_memory = Number.MIN_VALUE;
    var best_key_memory = null;

    for (const [key, value] of supportMemory) {
      //console.log(key, value.time);
      if (value.time > performance.now()) {
        var current_score = averageScore(value.args, value.desire, actualScore, parcelsToDeliver);
        value.args.score = current_score;

        if (current_score > best_score_memory) {
          best_option_memory = { desire: value.desire, args: value.args }
          best_score_memory = current_score;
          best_key_memory = key;
        }
      } else {
        supportMemory.delete(key);
      }
    }
    
    const current_intention_score = averageScore(this.current_intention.getArgs(), this.current_intention.getDesire(), actualScore, parcelsToDeliver);

    if (best_score_memory - 1 > current_intention_score) {
      //if memory wins create new intention and push to queue
      console.log("Memory wins");
      supportMemory.delete(best_key_memory);
      await this.stop();
      const intention = new Intention(best_option_memory.desire, best_option_memory.args);
      this.intention_queue.unshift(intention);
      return true;
    } 
    return false;
  }

  // async intentionRevision() {
  //   if (this.intention_queue.length == 0 && supportMemory.size == 0) {
  //     return;
  //   }
  //   //Calculate the actual score and the parcels to deliver
  //   var actualScore = 0;
  //   var parcelsToDeliver = 0;
  //   for (const parcel of parcels.values()) {
  //     if (parcel.carriedBy == me.id) {
  //       actualScore += parcel.reward;
  //       parcelsToDeliver++;
  //     }
  //   }

  //   //Best option already in queue
  //   var best_option_queue = { desire: null, args: null };
  //   var best_score_queue = Number.MIN_VALUE;

  //   for (var i = 0; i < this.intention_queue.length; i++) {
  //     // const key = this.#desire + "_" + me.x + "_" + me.y + "_" + args.x + "_" + args.y;
  //     console.log(this.intention_queue.length)
  //     if (this.intention_queue[i].getDesire() != GO_PUT_DOWN) {
  //       const failed_key = this.intention_queue[i].getDesire() + "_" + me.x + "_" + me.x + "_" + this.intention_queue[i].getArgs().x + "_" + this.intention_queue[i].getArgs().y;
  //       if (old_failed_plans[failed_key]){
  //         this.intention_queue.splice(i, 1);
  //         continue;
  //       }
  //     }
  //     if (this.intention_queue[i].getArgs().time > performance.now()) {
  //       this.intention_queue.splice(i, 1);
  //     } else {
  //       var current_score = averageScore(this.intention_queue[i].getArgs(), this.intention_queue[i].getDesire(), actualScore, parcelsToDeliver);

  //       if (current_score > best_score_queue) {
  //         best_option_queue = i;
  //         best_score_queue = current_score;
  //       }
  //     }
  //   }

  //   //Best option in memory
  //   var best_option_memory = { desire: null, args: null };
  //   var best_score_memory = Number.MIN_VALUE;
  //   var best_key_memory = null;

  //   for (const [key, value] of supportMemory) {
  //     //console.log(key, value.time);
  //     if (value.time < performance.now()) {
  //       var current_score = averageScore(value.args, value.desire, actualScore, parcelsToDeliver);
  //       supportMemory[key].args.score = current_score;

  //       if (current_score > best_score_memory) {
  //         best_option_memory = { desire: value.desire, args: value.args }
  //         best_score_memory = current_score;
  //         best_key_memory = key;
  //       }
  //     } else {
  //       supportMemory.delete(key);
  //     }
  //   }

  //   // if (best_option_memory.desire == null && best_option_queue.desire == null) {
  //   //   const best_option_blind = { desire: BLIND_MOVE, args: weightedBlindMove({ x: me.x, y: me.y }) };
  //   //   const intention = new Intention(best_option_blind.desire, best_option_blind.args);
  //   //   this.intention_queue.unshift(intention);
  //   // } else
  //   if (best_score_memory > best_score_queue) {
  //     //if memory wins create new intention and push to queue
  //     supportMemory.delete(best_key_memory);
  //     const intention = new Intention(best_option_memory.desire, best_option_memory.args);
  //     this.intention_queue.unshift(intention);
  //   } else {
  //     // move the element to index best_option_queue to the top of the queue
  //     const intention = this.intention_queue[best_option_queue];
  //     this.intention_queue.splice(best_option_queue, 1);
  //     this.intention_queue.unshift(intention);
  //   }
  // }

  //Revise the intentions to see if the best option is better than the current intention
  async intentionReplace(desire, args) {
    if (this.current_intention.getDesire() == BLIND_MOVE && (desire == GO_PICK_UP || desire == GO_PUT_DOWN)) {
      await this.stop();
    } else if (this.current_intention.getDesire() == GO_PICK_UP && this.current_intention.getArgs().score < args.score && this.current_intention.getArgs().id != args.id) {
      await this.stop();
    } else if (this.current_intention.getDesire() == GO_PUT_DOWN && this.current_intention.getArgs().score < args.score) {
      await this.stop();
    }
  }

  //Insert the new intention in the queue after some checks
  async queue(desire, args) {

    /*
    if (this.current_intention.getDesire() != desire || (this.current_intention.getDesire() == desire && desire == GO_PICK_UP && this.current_intention.getArgs().id != args.id)) {
      if (this.intention_queue.length == 0) {
        console.log("Adding new intention to empty queue: " + desire);
        const current = new Intention(desire, args);
        this.intention_queue.push(current);
      } else if (desire == GO_PICK_UP) {
        if (!this.intention_queue.some(obj => obj.getDesire() == desire && obj.getArgs().id == args.id)) {
          console.log("Adding new pickup intention to queue");
          const current = new Intention(desire, args);
          this.intention_queue.push(current);
        }
      } else if (desire == GO_PUT_DOWN) {
        if (this.intention_queue.some(obj => obj.getDesire() == desire)) {
          console.log("Updating old putdow intention");
          this.intention_queue.splice(this.intention_queue.indexOf(this.intention_queue.findIndex(obj => obj.getDesire() == desire)), 1);
          const current = new Intention(desire, args);
          this.intention_queue.push(current);
        } else {
          console.log("Adding new putdown intention to queue");
          const current = new Intention(desire, args);
          this.intention_queue.push(current);
        }
      }
    }
     */


    //If the intention is different from the actual one or if it is the same but referring to other objects we add it to the queue
    if (this.current_intention.getDesire() != desire || this.current_intention.getArgs().id != args.id) {
      //If the queue is empty we add the intention
      if (this.intention_queue.length == 0) {
        console.log("Adding new intention to empty queue: " + desire);
        const current = new Intention(desire, args);
        this.intention_queue.push(current);
      } else if (desire == GO_PICK_UP) {
        //If the intention is to pick up we check if there is already an intention to pick up the same parcel
        for (const intention of this.intention_queue) {
          if (intention.getArgs() == args) { //SHOULD BE !=
            console.log("Adding new intention to queue: " + desire);
            const current = new Intention(desire, args);
            this.intention_queue.push(current);
          }
        }
      } else if (desire == GO_PUT_DOWN) {
        //If the intention is to put down we check if there is already an intention to put down the same parcels and we update it
        var found = false;
        //Maybe this is not needed (TO CHECK) needed if we want to revise intentions because it has the score
        for (const intention of this.intention_queue) {
          if (intention.getDesire() == desire) {
            console.log("Removing old: " + desire + " and adding new intention to queue: ");
            this.intention_queue.splice(this.intention_queue.indexOf(intention), 1);
            const current = new Intention(desire, args);
            this.intention_queue.push(current);
            found = true;
          }
        }
        if (!found) {
          //If there is no intention to put down the same parcels we add the intention
          console.log("Adding new intention to queue: " + desire);
          const current = new Intention(desire, args);
          this.intention_queue.push(current);
        }
      }
    }

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
const old_failed_plans = {}

class Intention extends Promise {
  #current_plan;
  #stopped = false;
  #started = false;

  stop() {
    this.#stopped = true;
    if (this.#current_plan)
      this.#current_plan.stop();
  }
  get stopped() {
    return this.#stopped;
  }

  #desire;
  #args;

  #resolve;
  #reject;

  constructor(desire, args) {
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

  getArgs() {
    return this.#args;
  }

  getDesire() {
    return this.#desire;
  }

  setArgs(args) {
    this.#args = args;
  }

  async achieve() {
    if (this.#started) return this;
    else this.#started = true;

    for (const plan of plans) {

      if (this.stopped) throw ['stopped intention'];

      if (plan.isApplicableTo(this.#desire)) {
        this.#current_plan = plan;
        console.log("achieving desire: " + this.getDesire());
        try {
          const plan_res = await plan.execute(this.#desire, this.#args);
          this.#resolve(plan_res);

          console.log("plan: " + this.getDesire() + " -- succesfully achieved");
          myAgent.resetCurrentIntention();

          return plan_res;
        } catch (e) {
          console.log("plan: " + this.getDesire() + " -- failed while trying to achieve");
          if (this.#desire != GO_PUT_DOWN) {
            const key = this.#desire + "_" + me.x + "_" + me.y + "_" + this.#args.x + "_" + this.#args.y;
            if (!old_failed_plans[key]) old_failed_plans[key] = this.#current_plan
          }
          this.#current_plan.stop();
          this.#stopped = true;
        }
      }
    }

    // if stopped then quit
    if (this.stopped) throw ['stopped intention'];

    this.#reject();
    throw "no plan satisfied the desire " + this.getDesire();
  }
}

class Plan {
  #stopped = false;
  stop() {
    console.log("stop plan and all sub intentions");
    this.#stopped = true;
    for (const i of this.#sub_intentions) {
      i.stop();
    }
  }
  get stopped() {
    return this.#stopped;
  }
  setStopped(value) {
    this.#stopped = value;
  }

  #sub_intentions = [];

  async planExecutor(plan) {
    var actionsDone = [plan.length];
    if (this.stopped) throw ['stopped'];

    try {
      switch (plan[0]) {
        case "pickup":
          actionsDone[0] = await client.pickup();
          break;
        case "putdown":
          actionsDone[0] = await client.putdown();
          break;
        default:
          actionsDone[0] = await client.move(plan[0]);
          break;
      }

      if (this.stopped) throw ['stopped'];

      for (var i = 1; i < plan.length; i++) {
        if (this.stopped) throw ['stopped'];

        if (actionsDone[i - 1]) {
          switch (plan[i]) {
            case "pickup":
              actionsDone[i] = await client.pickup();
              break;
            case "putdown":
              actionsDone[i] = await client.putdown();
              break;
            default:
              actionsDone[i] = await client.move(plan[i]);
              break;
          }
        }
      }
      return true;
    } catch (e) {
      throw ['stopped'];
    }
  }

  async subIntention(desire, args) {
    const sub_intention = new Intention(desire, args);
    this.#sub_intentions.push(sub_intention);
    return await sub_intention.achieve();
  }
}

// old_plans_dictionary with key: desire_sx_sy_gx_gy and value: plan moves
var old_plans_dictionary = {};

class GoPickUp extends Plan {
  isApplicableTo(desire) {
    return desire == GO_PICK_UP;
  }

  async execute(desire, args) {
    // Create PDDL plan    
    this.setStopped(false);
    const key = desire + "_" + me.x + "_" + me.y + "_" + args.x + "_" + args.y;
    if (old_plans_dictionary[key]) {
      console.log("old plan found");
      return await this.planExecutor(old_plans_dictionary[key]);
    }
    var goal = goalParser(desire, args, me.id);

    if (this.stopped) throw ['stopped'];
    var plan = await planner(parcels, agents, me, goal);
    if (plan == "no plan found") throw ['no plan found'];

    console.log('plan: ', plan);
    old_plans_dictionary[key] = plan;
    return await this.planExecutor(plan);
  }
}

class GoPutDown extends Plan {
  isApplicableTo(desire) {
    return desire == GO_PUT_DOWN;
  }

  async execute(desire, args) {
    // Create PDDL plan    
    this.setStopped(false);
    var goal = goalParser(desire, args.deliveries, me.id);

    if (this.stopped) throw ['stopped'];
    var plan = await planner(parcels, agents, me, goal);
    if (plan == "no plan found") throw ['no plan found'];

    console.log('plan: ', plan);

    await this.planExecutor(plan);
    parcels.clear();
    return true;
  }
}

class BlindMove extends Plan {
  isApplicableTo(desire) {
    return desire == BLIND_MOVE;
  }

  async execute(desire, args) {
    // Create PDDL plan    
    this.setStopped(false);
    const key = desire + "_" + me.x + "_" + me.y + "_" + args.x + "_" + args.y;
    if (old_plans_dictionary[key]) {
      console.log("old plan found");
      return await this.planExecutor(old_plans_dictionary[key]);
    }
    var goal = goalParser(desire, args, me.id);

    if (this.stopped) throw ['stopped'];
    var plan = await planner(parcels, agents, me, goal);

    if (plan == "no plan found") throw ['no plan found'];

    console.log('plan: ', plan);
    old_plans_dictionary[key] = plan;
    return await this.planExecutor(plan);
  }
}

myAgent.resetCurrentIntention();
plans.push(new GoPickUp());
plans.push(new BlindMove());
plans.push(new GoPutDown());
