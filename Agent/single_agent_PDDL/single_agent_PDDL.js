import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { planner, goalParser, mapParser, readDomain } from "./test_PDDL_moletta.js";
import { findDeliveryPoint } from ".././utils/astar_utils.js";

const client = new DeliverooApi(
  "http://localhost:8080/?name=Cannarsi",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5ZDBiMDA0NDdlIiwibmFtZSI6IkNhbm5hcnNpIiwiaWF0IjoxNjgyMDk4NTI0fQ.juYE2bZS6jm8ghTqrpfheFSVSjpIz_C1s-bPIj4LN1w"
);

// TODO:
// - after delivery if there are no parcels the agent stops
// - find a way to make a stoppable common function for the movements execution

const GO_PUT_DOWN = "go_put_down";
const GO_PICK_UP = "go_pick_up";
const BLIND_MOVE = "blind_move";

let maxX = 0;
let maxY = 0;
var mapData;
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
setTimeout(() => {}, 1000);

const config = new Map();
client.onConfig((conf) => {
  config.set("parGenInt", conf.PARCELS_GENERATION_INTERVAL.split("s")[0] * 1000);
  config.set("moveDur", conf.MOVEMENT_DURATION);
  config.set("ageObsDist", conf.AGENTS_OBSERVATION_DISTANCE);
  config.set("parObsDist", conf.PARCELS_OBSERVATION_DISTANCE);
  config.set("parRewAvg", conf.PARCEL_REWARD_AVG);
  config.set("parRewVar", conf.PARCEL_REWARD_VARIANCE);
  if (conf.PARCEL_DECADING_INTERVAL == "infinite") {
    config.set("parDecInt", "infinite")
  } else {
    config.set("parDecInt", conf.PARCEL_DECADING_INTERVAL.split("s")[0] * 1000);
  }
});

//Read the PDDL domain from the file
readDomain();

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

const agents = new Map();
client.onAgentsSensing(async (perceived_agents) => {
  for (const a of perceived_agents) {
    agents.set(a.id, a);
  }
});

//Generate and return random coordinates with higher probability for further positions
function weightedBlindMove(agentPosition) {
  const offset = Math.ceil(config.get("parObsDist") / 2);

  // Calculate the distances from the agent to each coordinate
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

  //If there are no points in the distances array return a random point (this should never happen)
  if (distances.length == 0) {
    var targetX = 0;
    var targetY = 0;
    do {
      targetX = Math.floor(Math.random() * maxX);
      targetY = Math.floor(Math.random() * maxY);
    } while (mapData[targetX][targetY] == 0);
  
    return [{ x: targetX, y: targetY }, 0]
  }
  
  // Sort the coordinates randomly
  distances.sort(() => Math.random() - 0.5);
  return [distances[Math.floor(Math.random() * distances.length)], 0];
}

//Calculate an ideal score based on the beliefs of the agent to select the best option
function averageScore(args, desire, actualScore, parcelsToDeliver) {
  if (desire == GO_PICK_UP) {
    //If there is no decaying time prioritize picking up parcels (MAX_VALUE to be changed with a threshold value to go deliver)
    if (config.get("parDecInt") == "infinite") return Number.MAX_VALUE;

    var distance = Math.abs(Math.round(args.x) - Math.round(me.x)) + Math.abs(Math.round(args.y) - Math.round(me.y));
    //The score to pick up a parcel is the actual score plus the reward of the parcel
    //minus the number of parcels to deliver plus the one we want to pick up multiplied by the time to make a move times the number of moves required to reach the parcel 
    //divided by the parcel decaying time
    return ((actualScore + args.reward) - (((parcelsToDeliver + 1) * (config.get("moveDur") * distance)) / config.get("parDecInt")));
  }
  if (desire == GO_PUT_DOWN) {
    if (parcelsToDeliver == 0) return Number.MIN_VALUE;
    //In this way if we have infinite dacaying time we return max value for pick up intentions and max value divided by 2 for delivery intentions
    //As a result pick up intentions will be prioritized and delivery intentions will be executed only if there are no parcels to pick up
    if (config.get("parDecInt") == "infinite") return Number.MAX_VALUE/2;
    
    var closestDelivery = findDeliveryPoint(me.x, me.y, delivery_points);
    var distance = Math.abs(Math.round(closestDelivery.x) - Math.round(me.x)) + Math.abs(Math.round(closestDelivery.y) - Math.round(me.y));

    //The score to deliver the parcels is the actual score minus the number of parcels to deliver multiplied by the time to make a move times the number of moves 
    //required to reach the delivery point divided by the parcel dacaying time
    return ((actualScore) - (parcelsToDeliver * (config.get("moveDur") * distance) / config.get("parDecInt")));
  }
}

//Check the environment to search for the best possible action to take
function checkOptions() {
  const options = [];
  const deliveries = [];
  var actualScore = 0;
  var parcelsToDeliver = 0;

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
  options.push({ desire: GO_PUT_DOWN, args: deliveries });

  //Check all the options to find the best one
  let best_option = { desire: null, args: null };
  let best_score = Number.MIN_VALUE;

  for (const option of options) {
    let current_desire = option.desire;
    let current_score = averageScore(option.args[0], current_desire, actualScore, parcelsToDeliver);
    if (current_score > best_score) {
      best_option = { desire: option.desire, args: option.args }
      best_score = current_score;
    }
  }

  //If no best option is found, the agent performs a blind move otherwise the agents calls the intention revision to see if the best option is better than the current intention
  if (best_option.desire == null) {
    console.log("No best option, going for the blind move");
    best_option = { desire: BLIND_MOVE, args: weightedBlindMove({ x: me.x, y: me.y }) };
  } else {
    myAgent.intentionRevision(best_option.desire)
  }

  //The best option is added to the intention queue
  if (best_option.desire != null) myAgent.queue(best_option.desire, ...best_option.args);
}
client.onParcelsSensing(checkOptions);

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
        console.log("Adding new intention to empty queue: " + desire);
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
        console.log("achieving desire: " + this.#desire + " with plan: " + plan);
        try {
          const plan_res = await plan.execute(this.#desire, ...this.#args);
          this.#resolve(plan_res);

          console.log("plan: " + plan + " succesfully achieved");
          myAgent.updateCurrentIntention();

          return plan_res;
        } catch (error) {
          console.log("plan: " + plan + " failed while trying to achieve");
        }
      }
    }

    this.#reject();
    console.log("no plan satisfied the desire ", this.#desire, ...this.#args);
    throw "no plan satisfied the desire " + this.#desire;
  }
}

const plans = [];

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

  async execute(desire, ...args) {
    // Create PDDL plan    
    if (this.stopped) throw ['stopped']; // if stopped then quit
    var goal = goalParser(desire, args[0], me.id);

    if (this.stopped) throw ['stopped']; // if stopped then quit
    var plan = await planner(parcels, agents, me, goal);
    console.log('plan: ', plan);

    if (this.stopped) throw ['stopped']; // if stopped then quit  


    if (plan.length == 0) return false;
    var actionsDone = [plan.length];

    if (this.stopped) throw ['stopped'];

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
    if (this.stopped) throw ['stopped'];
    return true;
  }
}

class GoPutDown extends Plan {
  isApplicableTo(desire) {
    return desire == GO_PUT_DOWN;
  }

  async execute(desire, ...args) {
    // Create PDDL plan    
    if (this.stopped) throw ['stopped']; // if stopped then quit
    var goal = goalParser(desire, args, me.id);

    if (this.stopped) throw ['stopped']; // if stopped then quit
    var plan = await planner(parcels, agents, me, goal);
    console.log('plan: ', plan);

    if (this.stopped) throw ['stopped']; // if stopped then quit


    if (plan.length == 0) return false;
    var actionsDone = [plan.length];

    if (this.stopped) throw ['stopped'];

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
    if (this.stopped) throw ['stopped'];
    return true;
  }
}

class BlindMove extends Plan {
  isApplicableTo(desire) {
    return desire == BLIND_MOVE;
  }

  async execute(desire, ...args) {
    // Create PDDL plan    
    if (this.stopped) throw ['stopped']; // if stopped then quit
    var goal = goalParser(desire, args[0], me.id);

    if (this.stopped) throw ['stopped']; // if stopped then quit
    var plan = await planner(parcels, agents, me, goal);
    console.log('plan: ', plan);

    if (this.stopped) throw ['stopped']; // if stopped then quit

    if (plan.length == 0) return false;
    var actionsDone = [plan.length];

    if (this.stopped) throw ['stopped'];

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
    if (this.stopped) throw ['stopped'];
    return true;
  }
}

myAgent.updateCurrentIntention();
plans.push(new GoPickUp());
plans.push(new BlindMove());
plans.push(new GoPutDown());