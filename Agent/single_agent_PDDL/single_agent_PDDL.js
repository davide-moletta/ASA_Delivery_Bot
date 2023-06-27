import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { planner, goalParser, mapParser, readDomain } from "./test_PDDL_moletta.js";

const client = new DeliverooApi(
  "http://localhost:8080/?name=Cannarsi",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5ZDBiMDA0NDdlIiwibmFtZSI6IkNhbm5hcnNpIiwiaWF0IjoxNjgyMDk4NTI0fQ.juYE2bZS6jm8ghTqrpfheFSVSjpIz_C1s-bPIj4LN1w"
);

// TODO:
// - pickup and putdown during a plan
// - update metrics based on the server values
// - weight the random function for the blindMove
// - create checks for the delivery intentions

const GO_PUT_DOWN = "go_put_down";
const GO_PICK_UP = "go_pick_up";
const BLIND_MOVE = "blind_move";

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

readDomain();

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

const agents = new Map();
client.onAgentsSensing(async (perceived_agents) => {
  for (const a of perceived_agents) {
    agents.set(a.id, a);
  }
});

function blindMove() {
  var targetX = 0;
  var targetY = 0;

  do {
    targetX = Math.floor(Math.random() * maxX);
    targetY = Math.floor(Math.random() * maxY);
  } while (mapData[targetX][targetY] == 0);

  return [{ x: targetX, y: targetY }, 0]
}

function averageScore(args, desire) {
  var actualScore = 0;
  var parcelsToDeliver = 0;

  for (const parcel of parcels.values()) {
    if (parcel.carriedBy == me.id) {
      actualScore += parcel.reward;
      parcelsToDeliver++;
    }
  }

  if (desire == GO_PICK_UP) {
    //The possible score is the actual score of the parcels that I'm carrying - the distance from me to the parcel I want to pickup * the number of parcels that I'm carrying
    //This is to calculate the average score that I can have once i reach the target parcel
    //Plus the value of the target parcel - the distance to calculate the value of the parcel once I reach it

    var distance = Math.abs(Math.round(args.x) - Math.round(me.x)) + Math.abs(Math.round(args.y) - Math.round(me.y));
    return (actualScore + args.reward) - ((parcelsToDeliver + 1) * distance);
  }
  if (desire == GO_PUT_DOWN) {
    if (parcelsToDeliver == 0) {
      return Number.MIN_VALUE;
    }
    //The possible score is the actual score of the parcels that I'm carrying - the distance from me to the closest delivery point * the number of parcels that I'm carrying
    //This is to calculate the average score that I can have once i reach the delivery point
    return actualScore - parcelsToDeliver + 10 * parcels.size;
  }
}

function agentLoop() {
  const options = [];
  const deliveries = [];
  for (const parcel of parcels.values()) {
    if (!parcel.carriedBy) {
      options.push({ desire: GO_PICK_UP, args: [parcel, parcel.id] });
    } else if (parcel.carriedBy == me.id) {
      deliveries.push(parcel);
    }
  }
  options.push({ desire: GO_PUT_DOWN, args: deliveries });


  let best_option = { desire: null, args: null };
  let nearest = Number.MIN_VALUE;
  for (const option of options) {
    let current_desire = option.desire;
    let current_score = averageScore(option.args[0], current_desire);
    if (current_score > nearest) {
      best_option = { desire: option.desire, args: option.args }
      nearest = current_score;
    }
  }

  if (best_option.desire == null) {
    console.log("No best option, going for the blind move");
    best_option = { desire: BLIND_MOVE, args: blindMove() };
  } else {
    myAgent.intentionRevision(best_option.desire, ...best_option.args)
  }

  // if best option parcel is already in the queue, remove the old one and add the new one
  if (best_option.desire != null) myAgent.queue(best_option.desire, ...best_option.args);
}
client.onParcelsSensing(agentLoop);

class Agent {
  intention_queue = new Array();
  current_intention

  async intentionLoop() {
    while (true) {
      const intention = this.intention_queue[0];
      if (intention) {
        this.current_intention = intention;
        try{
          await intention.achieve();
        } catch (e) {
          console.log(e);
        }
        this.intention_queue.shift();
      }
      await new Promise((res) => setImmediate(res));
    }
  }

  createCurrentIntention() {
    this.current_intention = new Intention(null, ...[null, null])
  }

  updateCurrentIntention() {
    this.current_intention = new Intention(null, ...[null, null]);
  }

  async intentionRevision(desire, ...args) {
    if (this.current_intention.getDesire() == BLIND_MOVE && (desire == GO_PICK_UP || desire == GO_PUT_DOWN)){
      await this.stop();
    }
  }

  async queue(desire, ...args) {
    if (this.current_intention.getDesire() != desire || this.current_intention.getArgs[1] != args[1]) {
      if (this.intention_queue.length == 0) {
        console.log("Adding new intention to empty queue: " + desire);
        const current = new Intention(desire, ...args);
        this.intention_queue.push(current);
      } else if (desire == GO_PICK_UP) {
        for (const intention of this.intention_queue) {
          if (intention.getArgs() == args) {
            // we add only if it is a new intention
            console.log("Adding new intention to queue: " + desire);
            const current = new Intention(desire, ...args);
            this.intention_queue.push(current);
          }
        }
      } else if (desire == GO_PUT_DOWN) {
        var found = false;
        for (const intention of this.intention_queue) {
          if (intention.getDesire() == desire) {
            // we update the put down intentions
            console.log("Removing old: " + desire + " and adding new intention to queue: ");
            this.intention_queue.splice(this.intention_queue.indexOf(intention), 1);
            const current = new Intention(desire, ...args);
            this.intention_queue.push(current);
            found = true;
          }
        }
        if (!found) {
          console.log("Adding new intention to queue: " + desire);
          const current = new Intention(desire, ...args);
          this.intention_queue.push(current);
        }
      }
    }
  }

  async stopCurrentIntention() {
    if (this.current_intention.getDesire() != null) {
      console.log("stop current intention: " + this.current_intention.getDesire());
      this.current_intention.stop();
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


/**
 * Plan library
 */
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

class MoveToTarget extends Plan {

  #actions;

  constructor(plan) {
    this.#actions = plan;
  }

  async moveToTarget() {
    if (this.#actions.length == 0) return false;
    var actionsDone = [this.#actions.length];

    if (this.stopped) return false;

    switch (this.#actions[0]) {
      case "pickup":
        actionsDone[0] = await client.pickup();
        break;
      case "putdown":
        actionsDone[0] = await client.putdown();
        break;
      default:
        actionsDone[0] = await client.move(this.#actions[0]);
        break;
    }

    if (this.stopped) return false;

    for (var i = 1; i < this.#actions.length; i++) {
      if (this.stopped) return false;
      if (actionsDone[i - 1]) {
        switch (this.#actions[i]) {
          case "pickup":
            actionsDone[i] = await client.pickup();
            break;
          case "putdown":
            actionsDone[i] = await client.putdown();
            break;
          default:
            actionsDone[i] = await client.move(this.#actions[i]);
            break;
        }
      }
    }
    if (this.stopped) return false;
    return true;
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


myAgent.createCurrentIntention();
plans.push(new GoPickUp());
plans.push(new BlindMove());
plans.push(new GoPutDown());