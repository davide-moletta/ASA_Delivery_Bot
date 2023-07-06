import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { planner, goalParser, mapParser, readDomain } from "./PDDL_planner.js";
import { findDeliveryPoint } from "./astar_utils.js";

const client = new DeliverooApi(
  "http://localhost:8080/?name=A",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImEwNjkwNmVlNGNjIiwibmFtZSI6IkEiLCJpYXQiOjE2ODg2NTc2Mjl9.BOfdZ63naCjNS8c_EU4-2WnQO7U7YWb_EMHDD8sxMTI"
);

//Possible desires of our agent
const GO_PUT_DOWN = "go_put_down";
const GO_PICK_UP = "go_pick_up";
const BLIND_MOVE = "blind_move";

//Data of the map received from the server
let maxX = 0;
let maxY = 0;
var mapData;
const delivery_points = [];

//Memory of the agent about intentions and plans
const plans = [];
var supportMemory = new Map();
const old_failed_plans = {}
//Old_plans_dictionary with key: desire_sx_sy_gx_gy and value: plan moves
var old_plans_dictionary = {};

//Listenerfor the map sent by the server
client.onMap((width, height, tiles) => {
  maxX = width;
  maxY = height;

  //Fill the map with zeros which will be considered as non walkable cells
  mapData = new Array(maxX).fill(0).map(() => new Array(maxY).fill(0));

  //For each tile of the map received from the server, if it is a delivery point set the value to 2 and add the point to the delivery point array, otherwise set it to 1
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

//----------BELIEF REVISION----------

//Me listener to get the agent id and position
const me = {};
client.onYou(({ id, x, y }) => {
  me.id = id;
  me.x = Math.round(x);
  me.y = Math.round(y);
});

//Parcel listener to get the parcels position
var parcels = new Map();
client.onParcelsSensing(async (perceived_parcels) => {
  parcels = new Map();
  for (const p of perceived_parcels) {
    if (!p.carriedBy || p.carriedBy == me.id) {
      p.x = Math.round(p.x);
      p.y = Math.round(p.y);
      parcels.set(p.id, p);
    }
  }
});

//Agents listener to get the other agents position
var agents = new Map();
client.onAgentsSensing(async (perceived_agents) => {
  agents = new Map();
  for (const a of perceived_agents) {
    a.x = Math.round(a.x);
    a.y = Math.round(a.y);
    agents.set(a.id, a);
  }
});

//----------END OF BELIEF REVISION----------

//Generate and return random coordinates with higher probability for further positions
function weightedBlindMove(agentPosition) {
  //Create an offset to avoid cells in the FOV of the agent
  const offset = Math.ceil(config.get("parObsDist") / 2);

  //Varaible weight to give a higher probability to further positions
  var weight;

  //Calculate the distances from the agent to each coordinate
  const distances = [];
  for (let i = offset; i < maxX - offset; i++) {
    for (let j = offset; j < maxY - offset; j++) {
      //If the point is not walkable skip it
      if (mapData[j][i] == 0) continue;

      //Calculate the distance from the agent and if it is less than the observation distance skip it (i'm seeing it)
      var distance = Math.abs(agentPosition.x - j) + Math.abs(agentPosition.y - i);
      if (distance < offset) continue;

      weight = distance / 5;
      //Push the coordinates in the array with a number of repetitions based on the weight
      for (let k = 0; k < weight; k++) {
        distances.push({ x: j, y: i, score: Number.MIN_VALUE });
      }
    }
  }

  //If there are no points in the distances array return a random walkable point (for example if the agent is seeing all the map)
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
    //Calculate the distance from the agent to the parcel
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

    //If the parcel decaying time is infinite and the distance is less than the weight or if the agent is holding a number of parcels prioritize delivering
    // otherwise prioritize picking up parcels
    if (config.get("parDecInt") == 'infinite') {
      //If move duration is below 50, MAX_PARCEL_ON_HEAD is 30, if between 50 and 200 it is 20, if above 200 it is 10
      const MAX_PARCEL_ON_HEAD = config.get("moveDur") <= 50 ? 30 : config.get("moveDur") <= 200 ? 20 : 10;
      //If move duration is below 50, MIN_DISTANCE is 2, if between 50 and 200 it is 4, if above 200 it is 5
      const MIN_DISTANCE = config.get("moveDur") <= 50 ? 2 : config.get("moveDur") <= 200 ? 2 : 2;
      if (parcelsToDeliver >= MAX_PARCEL_ON_HEAD || distance < MIN_DISTANCE) {
        return Number.MAX_VALUE;
      } else {
        return 500;
      }
    }

    //If the parcel decaying time is not infinite, the score to deliver the parcels is the actual score plus the actual score divided by 5
    //minus the number of parcels to deliver multiplied by the time required to make a move times the distance from the delivery point 
    //divided by the parcel dacaying time
    const BONUS = actualScore / 4;
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
        //If the parcel is not carryed by anyone push a pickup desire in the options
        options.push({ desire: GO_PICK_UP, args: { id: parcel.id, x: parcel.x, y: parcel.y, reward: parcel.reward, score: 0 } });
      } else if (parcel.carriedBy == me.id) {
        //If the parcel is carryed by our agent add the reward to the actual score and increment the number of parcels to deliver and push the parcel in the deliveries array
        actualScore += parcel.reward;
        parcelsToDeliver++;
        deliveries.push(parcel);
      }
    }
    //If there are parcels to deliver push a putdown desire in the options
    if (parcelsToDeliver != 0) options.push({ desire: GO_PUT_DOWN, args: { deliveries: deliveries, score: 0 } });

    //Check all the options to find the best one
    best_option = { desire: null, args: null };
    let best_score = Number.MIN_VALUE;
    var bestIndex = 0;
    var metrics
    var decay_time = config.get("parDecInt") == 'infinite' ? 1 : config.get("parDecInt");

    for (var i = 0; i < options.length; i++) {
      //Calculate the score of the current option
      let current_score = averageScore(options[i].args, options[i].desire, actualScore, parcelsToDeliver);
      options[i].args.score = current_score;

      if (current_score > best_score) {
        //Update the best option
        best_option = { desire: options[i].desire, args: options[i].args }
        //Compute the metrics by taking the current time in millis + the parcel value multiplied by the decading time + the move time * distance, to later check if current time < metrics
        if (options[bestIndex].desire == GO_PICK_UP) {
          metrics = performance.now() + (options[bestIndex].args.reward * decay_time);
          supportMemory.set(options[bestIndex].desire + "-" + options[bestIndex].args.id, { desire: options[bestIndex].desire, args: options[bestIndex].args, time: metrics });
        } else if (options[bestIndex].desire == GO_PUT_DOWN) {
          metrics = performance.now() + parcelsToDeliver * decay_time * actualScore
          supportMemory.set(options[bestIndex].desire, { desire: options[bestIndex].desire, args: options[bestIndex].args, time: metrics });
        }
        best_score = current_score;
        bestIndex = i;
      } else {
        //Insert in the memory the discarded options
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
    //If there are no parcels seen by the agent the best option is a blind move
    best_option = { desire: BLIND_MOVE, args: weightedBlindMove({ x: me.x, y: me.y }) };
  }

  if (best_option.desire == null) {
    best_option = { desire: BLIND_MOVE, args: weightedBlindMove({ x: me.x, y: me.y }) };
  } else {
    //If our agent is doing something call the intention replace to see if we can replace the current intention with the best option
    if (myAgent.getCurrentDesire() != null) {
      await myAgent.intentionReplace(best_option.desire, best_option.args)
    }
  }

  //The best option is added to the intention queue
  myAgent.queue(best_option.desire, best_option.args);
}
//Check the options every 50ms
setInterval(async function () {
  await checkOptions();
}, 50);

class Agent {
  intention_queue = new Array();
  current_intention

  //The loop that runs the intentions
  async intentionLoop() {
    while (true) {
      //Call the intention revision to see if there are options in memory better than the current intention
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

  //Reset the current intention when the agent completes it or when a plan fails
  resetCurrentIntention() {
    this.current_intention = new Intention(null, null);
  }

  getCurrentDesire() {
    if (this.current_intention) return this.current_intention.getDesire();
    else return null;
  }

  //Intention revision
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
      //If the time of the option is greater than the current time it is still valid
      if (value.time > performance.now()) {
        //Calculate score of the option
        var current_score = averageScore(value.args, value.desire, actualScore, parcelsToDeliver);
        value.args.score = current_score;

        //Find the best option in memory
        if (current_score > best_score_memory) {
          best_option_memory = { desire: value.desire, args: value.args }
          best_score_memory = current_score;
          best_key_memory = key;
        }
      } else {
        //If the time of the option is less than the current time it is no longer valid so we remove it from the memory
        supportMemory.delete(key);
      }
    }

    //Calculate score of the current intention
    const current_intention_score = averageScore(this.current_intention.getArgs(), this.current_intention.getDesire(), actualScore, parcelsToDeliver);

    //If the current intention is worse than the best option in memory we replace the current intention with the best option in memory
    if (best_score_memory - 1 > current_intention_score) {
      supportMemory.delete(best_key_memory);
      await this.stop();
      const intention = new Intention(best_option_memory.desire, best_option_memory.args);
      this.intention_queue.unshift(intention);
      return true;
    }
    return false;
  }

  //Revise the intentions to see if the best option is better than the current intention
  async intentionReplace(desire, args) {
    //If the agent is performing a blind move and the new intention is to pick up or put down a parcel we stop the blind move
    if (this.current_intention.getDesire() == BLIND_MOVE && (desire == GO_PICK_UP || desire == GO_PUT_DOWN)) {
      await this.stop();
      //If the agent receives a pickup (for a different parcel) or putdown intention with a higher score than the current intention we stop the current intention
    } else if (this.current_intention.getDesire() == GO_PICK_UP && this.current_intention.getArgs().score < args.score && this.current_intention.getArgs().id != args.id) {
      await this.stop();
    } else if (this.current_intention.getDesire() == GO_PUT_DOWN && this.current_intention.getArgs().score < args.score) {
      await this.stop();
    }
    return true;
  }

  //Insert the new intention in the queue after some checks
  async queue(desire, args) {
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
          if (intention.getArgs() == args) {
            console.log("Adding new intention to queue: " + desire);
            const current = new Intention(desire, args);
            this.intention_queue.push(current);
          }
        }
      } else if (desire == GO_PUT_DOWN) {
        //If the intention is to put down we check if there is already an intention to put down the same parcels and we update it
        var found = false;
        for (const intention of this.intention_queue) {
          //If there is an intention to put down the same parcel we update it
          if (intention.getDesire() == desire) {
            console.log("Removing old: " + desire + " and adding new intention to queue: ");
            this.intention_queue.splice(this.intention_queue.indexOf(intention), 1);
            const current = new Intention(desire, args);
            this.intention_queue.push(current);
            found = true;
          }
        }
        if (!found) {
          //If there is no intention to put down we add the intention
          console.log("Adding new intention to queue: " + desire);
          const current = new Intention(desire, args);
          this.intention_queue.push(current);
        }
      }
    }
  }

  //Stop all the agent intentions
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

    //Check the plan library for a plan that can achieve the intention
    for (const plan of plans) {
      //If the intention has been stopped quit
      if (this.stopped) throw ['stopped intention'];

      if (plan.isApplicableTo(this.#desire)) {
        //If found the agent start to execute the plan
        this.#current_plan = plan;
        console.log("achieving desire: " + this.getDesire());
        try {
          const plan_res = await plan.execute(this.#desire, this.#args);
          this.#resolve(plan_res);

          console.log("plan: " + this.getDesire() + " -- succesfully achieved");
          myAgent.resetCurrentIntention();

          return plan_res;
        } catch (e) {
          //If the plan fails we stop the intention and add the plan to the failed plans
          console.log("plan: " + this.getDesire() + " -- failed while trying to achieve");
          if (this.#desire != GO_PUT_DOWN) {
            const key = this.#desire + "_" + me.x + "_" + me.y + "_" + this.#args.x + "_" + this.#args.y;
            if (!old_failed_plans[key]) old_failed_plans[key] = this.#current_plan
          }
          myAgent.resetCurrentIntention();
          this.#current_plan.stop();
          this.#stopped = true;
        }
      }
    }
    //If the intention has been stopped quit
    if (this.stopped) throw ['stopped intention'];

    this.#reject();
    throw "no plan satisfied the desire " + this.getDesire();
  }
}

class Plan {
  #stopped = false;
  //Stop the plan and all sub intentions
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

  //Executor of the plan, receives a list of strings containing all the actions to be executed and executes them
  async planExecutor(plan) {
    var actionsDone = [plan.length];
    //If the plan has been stopped quit
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

      //If the plan has been stopped quit
      if (this.stopped) throw ['stopped'];

      //Execute the action only if the previous action has been executed
      for (var i = 1; i < plan.length; i++) {
        //If the plan has been stopped quit
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

//Pick up plan
class GoPickUp extends Plan {
  isApplicableTo(desire) {
    return desire == GO_PICK_UP;
  }

  async execute(desire, args) {
    this.setStopped(false);

    //Check if there is a plan that has already been executed that can achieve the desire
    const key = desire + "_" + me.x + "_" + me.y + "_" + args.x + "_" + args.y;
    if (old_plans_dictionary[key]) {
      //If found execute the plan
      console.log("old plan found");
      return await this.planExecutor(old_plans_dictionary[key]);
    }

    //If not found create a new plan with the planner starting from the goal
    var goal = goalParser(desire, args, me.id);

    //If the plan has been stopped quit
    if (this.stopped) throw ['stopped'];

    //Create PDDL plan
    var plan = await planner(parcels, agents, me, goal);
    //If no plan exists throw an error
    if (plan == "no plan found") throw ['no plan found'];

    console.log('plan: ', plan);
    //Store the plan in the dictionary
    old_plans_dictionary[key] = plan;
    //Execute the plan
    return await this.planExecutor(plan);
  }
}

class GoPutDown extends Plan {
  isApplicableTo(desire) {
    return desire == GO_PUT_DOWN;
  }

  async execute(desire, args) {
    this.setStopped(false);

    //Create a goal for the intention
    var goal = goalParser(desire, args.deliveries, me.id);

    //If the plan has been stopped quit
    if (this.stopped) throw ['stopped'];

    //Create PDDL plan
    var plan = await planner(parcels, agents, me, goal);

    //If no plan exists throw an error
    if (plan == "no plan found") throw ['no plan found'];

    console.log('plan: ', plan);
    //Execute the plan
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
    this.setStopped(false);

    //Check if there is a plan that has already been executed that can achieve the desire
    const key = desire + "_" + me.x + "_" + me.y + "_" + args.x + "_" + args.y;
    if (old_plans_dictionary[key]) {
      //If found execute the plan
      console.log("old plan found");
      return await this.planExecutor(old_plans_dictionary[key]);
    }

    //If not found create a new plan with the planner starting from the goal
    var goal = goalParser(desire, args, me.id);

    //If the plan has been stopped quit
    if (this.stopped) throw ['stopped'];

    //Create PDDL plan
    var plan = await planner(parcels, agents, me, goal);
    //If no plan exists throw an error
    if (plan == "no plan found") throw ['no plan found'];

    console.log('plan: ', plan);
    //Store the plan in the dictionary
    old_plans_dictionary[key] = plan;
    //Execute the plan
    return await this.planExecutor(plan);
  }
}

//Push the possible plans into the list of plans
myAgent.resetCurrentIntention();
plans.push(new GoPickUp());
plans.push(new BlindMove());
plans.push(new GoPutDown());