import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { planner, goalParser, mapParser, readDomain } from "./test_PDDL_moletta.js";
import { findDeliveryPoint } from ".././utils/astar_utils.js";

const client = new DeliverooApi(
  "http://localhost:8080/?name=Cannarsi",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5ZDBiMDA0NDdlIiwibmFtZSI6IkNhbm5hcnNpIiwiaWF0IjoxNjgyMDk4NTI0fQ.juYE2bZS6jm8ghTqrpfheFSVSjpIz_C1s-bPIj4LN1w"
);

// TODO:
// - add memory
// - optimize the code (local planner)
// - probability model to foresee agents movements

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
  config.set("clock", conf.CLOCK*5); //Clock interval in milliseconds (not used)
  console.log(config);
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

const parcels = new Map();
client.onParcelsSensing(async (perceived_parcels) => {
  for (const p of perceived_parcels) {
    parcels.set(p.id, p);
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
      for (let k = 0; k < distance / 5; k++) {
        distances.push({ x: j, y: i });
      }
    }
  }

  //If there are no points in the distances array return a random walkable point (this should never happen)
  if (distances.length == 0) {
    var targetX = 0;
    var targetY = 0;
    do {
      targetX = Math.floor(Math.random() * maxX);
      targetY = Math.floor(Math.random() * maxY);
    } while (mapData[targetX][targetY] == 0);

    return [{ x: targetX, y: targetY }, 0]
  }

  //Sort the coordinates randomly and return a random one
  distances.sort(() => Math.random() - 0.5);
  return [distances[Math.floor(Math.random() * distances.length)], 0];
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
      if (distance <= 4) {
        return Number.MAX_VALUE;
      } else {
        return 500;
      }
    }

    //If the parcel decaying time is not infinite, the score to deliver the parcels is the actual score plus the actual score divided by ten
    //minus the number of parcels to deliver multiplied by the time required to make a move times the distance from the delivery point 
    //divided by the parcel dacaying time
    return ((actualScore + actualScore / 10) - (parcelsToDeliver * (config.get("moveDur") * distance) / config.get("parDecInt")));
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
        options.push({ desire: GO_PICK_UP, args: [parcel, parcel.id] });
      } else if (parcel.carriedBy == me.id) {
        actualScore += parcel.reward;
        parcelsToDeliver++;
        deliveries.push(parcel);
      }
    }
    if (parcelsToDeliver != 0) options.push({ desire: GO_PUT_DOWN, args: deliveries });

    //Check all the options to find the best one
    best_option = { desire: null, args: null };
    let best_score = Number.MIN_VALUE;
    for (const option of options) {
      let current_score = averageScore(option.args[0], option.desire, actualScore, parcelsToDeliver);
      if (current_score > best_score) {
        best_option = { desire: option.desire, args: option.args }
        best_score = current_score;
      }
    }
  } else {
    best_option = { desire: BLIND_MOVE, args: weightedBlindMove({ x: me.x, y: me.y }) };
  }

  //If no best option is found, the agent performs a blind move otherwise the agents calls the intention revision to see if the best option is better than the current intention
  if (best_option.desire == null) {
    best_option = { desire: BLIND_MOVE, args: weightedBlindMove({ x: me.x, y: me.y }) };
  } else {
    myAgent.intentionRevision(best_option.desire)
  }

  //The best option is added to the intention queue
  myAgent.queue(best_option.desire, ...best_option.args);
}
//client.onParcelsSensing(checkOptions);
setInterval(async function () {
  console.log("checking options");
  await checkOptions();
}, 50);//config.get("clock"));
//create a set "planning", if the agent is not planning, check for options
//if the agent is planning, await for the plan to be completed

class Agent {
  intention_queue = new Array();
  current_intention

  //The loop that runs the intentions
  async intentionLoop() {
    while (true) {
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
  updateCurrentIntention() {
    this.current_intention = new Intention(null, ...[null, null]);
  }

  //Revise the intentions to see if the best option is better than the current intention
  async intentionRevision(desire) {
    if (this.current_intention.getDesire() == BLIND_MOVE && (desire == GO_PICK_UP || desire == GO_PUT_DOWN)) {
      await this.stop();
    }
  }

  //Insert the new intention in the queue after some checks
  async queue(desire, ...args) {
    //If the intention is different from the actual one or if it is the same but referring to other objects we add it to the queue
    if (this.current_intention.getDesire() != desire || this.current_intention.getArgs[1] != args[1]) {
      //If the queue is empty we add the intention
      if (this.intention_queue.length == 0) {
        console.log("Adding new intention to empty queue: " + desire + " --- " + args[0].x + " - " + args[0].y);
        const current = new Intention(desire, ...args);
        this.intention_queue.push(current);
      } else if (desire == GO_PICK_UP) {
        //If the intention is to pick up we check if there is already an intention to pick up the same parcel
        for (const intention of this.intention_queue) {
          if (intention.getArgs() == args) {
            console.log("Adding new intention to queue: " + desire);
            const current = new Intention(desire, ...args);
            this.intention_queue.push(current);
          }
        }
      } else if (desire == GO_PUT_DOWN) {
        //If the intention is to put down we check if there is already an intention to put down the same parcels and we update it
        var found = false;
        for (const intention of this.intention_queue) {
          if (intention.getDesire() == desire) {
            console.log("Removing old: " + desire + " and adding new intention to queue: ");
            this.intention_queue.splice(this.intention_queue.indexOf(intention), 1);
            const current = new Intention(desire, ...args);
            this.intention_queue.push(current);
            found = true;
          }
        }
        if (!found) {
          //If there is no intention to put down the same parcels we add the intention
          console.log("Adding new intention to queue: " + desire);
          const current = new Intention(desire, ...args);
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

class Intention extends Promise {
  #current_plan;
  #stopped = false;

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

  getArgs() {
    return this.#args;
  }

  getDesire() {
    return this.#desire;
  }

  #started = false;
  async achieve() {
    if (this.#started) return this;
    else this.#started = true;

    for (const plan of plans) {

      if (this.stopped) throw ['stopped intention'];

      if (plan.isApplicableTo(this.#desire)) {
        this.#current_plan = plan;
        console.log("achieving desire: " + this.getDesire());
        try {
          const plan_res = await plan.execute(this.#desire, ...this.#args);
          this.#resolve(plan_res);

          console.log("plan: " + this.getDesire() + " -- succesfully achieved");
          myAgent.updateCurrentIntention();

          return plan_res;
        } catch (e) {
          console.log("plan: " + this.getDesire() + " -- failed while trying to achieve");
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

class GoPickUp extends Plan {
  isApplicableTo(desire) {
    return desire == GO_PICK_UP;
  }

  async execute(desire, ...args) {
    // Create PDDL plan    
    this.setStopped(false);
    var goal = goalParser(desire, args[0], me.id);

    if (this.stopped) throw ['stopped'];
    var plan = await planner(parcels, agents, me, goal);
    if (plan == "no plan found") throw ['no plan found'];

    console.log('plan: ', plan);

    return await this.planExecutor(plan);
  }
}

class GoPutDown extends Plan {
  isApplicableTo(desire) {
    return desire == GO_PUT_DOWN;
  }

  async execute(desire, ...args) {
    // Create PDDL plan    
    this.setStopped(false);
    var goal = goalParser(desire, args, me.id);

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

  async execute(desire, ...args) {
    // Create PDDL plan    
    this.setStopped(false);
    var goal = goalParser(desire, args[0], me.id);

    if (this.stopped) throw ['stopped'];
    var plan = await planner(parcels, agents, me, goal);

    if (plan == "no plan found") throw ['no plan found'];

    console.log('plan: ', plan);
    return await this.planExecutor(plan);
  }
}

myAgent.updateCurrentIntention();
plans.push(new GoPickUp());
plans.push(new BlindMove());
plans.push(new GoPutDown());
