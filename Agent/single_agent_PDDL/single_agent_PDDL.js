import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { planner, goalParser, mapParser, readDomain } from "./test_PDDL_moletta.js"; //, meParser, parcelsparser, agentsParser

const client = new DeliverooApi(
  "http://localhost:8080/?name=Cannarsi",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5ZDBiMDA0NDdlIiwibmFtZSI6IkNhbm5hcnNpIiwiaWF0IjoxNjgyMDk4NTI0fQ.juYE2bZS6jm8ghTqrpfheFSVSjpIz_C1s-bPIj4LN1w"
);

//TODO 
// weight the random function for the blindMove
// update scoring sistem
// create checks for the delivery intentions
// fix double pickup bug

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
setTimeout(() => {
  readDomain();

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

  function blindMove() {
    var targetX = 0;
    var targetY = 0;

    do {
      targetX = Math.floor(Math.random() * maxX);
      targetY = Math.floor(Math.random() * maxY);
    } while (mapData[targetX][targetY] == 0);

    return { x: targetX, y: targetY }
  }

  function averageScore(args, desire) {
    if (desire == "pickup") {
      //The possible score is the actual score of the parcels that I'm carrying - the distance from me to the parcel I want to pickup * the number of parcels that I'm carrying
      //This is to calculate the average score that I can have once i reach the target parcel
      //Plus the value of the target parcel - the distance to calculate the value of the parcel once I reach it

      //var distance = Math.abs(Math.round(args.x) - Math.round(me.x)) + Math.abs(Math.round(args.y) - Math.round(me.y));
      return args.reward;
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

    let best_option = { desire: "blindmove", args: null };
    let nearest = Number.MIN_VALUE;
    for (const option of options) {
      let current_desire = option.desire;
      let current_score = averageScore(option.args, current_desire);
      if (current_score > nearest) {
        best_option = { desire: option.desire, args: option.args }
        nearest = current_score;
      }
    }

    if (best_option.desire == "blindmove") best_option.args = blindMove();

    if (myAgent.intentionRevision(best_option.desire, best_option.args)) {
      console.log("added: " + best_option.desire);
      myAgent.queue(best_option.desire, best_option.args);
      if (best_option.desire == "pickup") {
        myAgent.updatePickupIntentions(best_option.args);
      }
    }
  }
  //client.onParcelsSensing(options);
  client.onYou(options);

  class Agent {
    intention_queue = new Array();
    current_desire = null;
    previous_desire = null;
    pickup_intentions = new Map();

    async intentionLoop() {
      while (true) {
        //check if the current intention is still valid (TODO)
        const intention = this.intention_queue.shift();
        if (intention) {
          if(intention == this.previous_desire){
            console.log("skipping same action")
          }else{
            this.current_desire = intention;
            await intention.achieve();
          }
        }
        await new Promise((res) => setImmediate(res));
      }
    }

    updatePickupIntentions(args) {
      this.pickup_intentions.set(args.id, args);
    }

    updateDesire(){
      this.previous_desire = this.current_desire;
      this.current_desire = null;
    }

    intentionRevision(desire, args) {
      switch (this.current_desire) {
        case "pickup":
          switch (desire) {
            case "pickup":
              if (this.pickup_intentions.has(args.id)) {
                return false;
              } else {
                return true;
              }
            case "delivery":
              return true;
            case "blindmove":
              return false;
          }
        case "delivery":
          switch (desire) {
            case "pickup":
              if (this.pickup_intentions.has(args.id)) {
                return false;
              } else {
                return true;
              }
            case "delivery":
              return false;
            case "blindmove":
              return false;
          }
        case "blindmove":
          switch (desire) {
            case "pickup":
              if (this.pickup_intentions.has(args.id)) {
                return false;
              } else {
                return true;
              }
            case "delivery":
              return true;
            case "blindmove":
              return false;
          }
        default:
          return true;
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

    getDesire() {
      return this.#desire;
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
        myAgent.updateDesire();
        console.log('plan', plan, 'succesfully achieved');
        return plan_res
      } catch (error) {
        console.log('plan', plan, 'failed while trying to achieve');
      }

      this.#reject();
      throw 'no plan satisfied the desire ' + this.#desire;
    }
  }
}, 1000);