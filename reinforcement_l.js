class QLearningAgent {
  constructor() {
    this.alpha = 0.1; // learning rate
    this.gamma = 0.9; // discount factor
    this.epsilon = 0.1; // exploration rate
    this.qValues = {}; // Q-values table
    this.lastAction = null;
    this.lastState = null;
  }

  // Given a state, returns the best action according to the Q-values table
  getBestAction(state) {
    const actions = ["up", "down", "left", "right", "pickup", "putdown"];
    const qValues = actions.map((a) => this.getQValue(state, a));
    const maxQ = Math.max(...qValues);
    const bestActions = actions.filter((a, i) => qValues[i] === maxQ);
    return bestActions[Math.floor(Math.random() * bestActions.length)];
  }

  // Given a state and an action, returns the Q-value for that state-action pair
  getQValue(state, action) {
    const key = JSON.stringify([state, action]);
    return this.qValues[key] || 0;
  }

  // Given a state, an action, a reward and a new state, updates the Q-values table
  updateQValue(state, action, reward, newState) {
    const key = JSON.stringify([state, action]);
    const oldQ = this.qValues[key] || 0;
    const maxQ =
      this.getBestAction(newState) === "putdown"
        ? 0
        : this.getQValue(newState, this.getBestAction(newState));
    const newQ = oldQ + this.alpha * (reward + this.gamma * maxQ - oldQ);
    this.qValues[key] = newQ;
  }

  // Given a state and a list of parcels, returns the state representation
  getState(state, parcels) {
    const { x, y } = state;
    const visibleMap = Map.slice(x - 2, x + 3).map((row) =>
      row.slice(y - 2, y + 3)
    );
    const visibleParcels = parcels.filter(
      (p) => Math.abs(p.x - x) <= 2 && Math.abs(p.y - y) <= 2
    );
    return JSON.stringify([visibleMap, visibleParcels]);
  }

  async act(parcels) {
    // Get the current state
    var a = {};
    // TODO it gives undefined
    client.onYou(you => {
        a.x = Math.round(you.x);
        a.y = Math.round(you.y);
    });
    console.log("you " + a.x + " " + a.y);
    const state = {
      agent_x: a.x,
      agent_y: a.y,
      parcels: parcels //.map((p) => ({
    //     x: p.x,
    //     y: p.y,
    //   })),
    };

    console.log("state " + state.agent_x + " " + state.agent_y);
  
    // Choose an action
    const action = this.getBestAction(state);
    console.log("action chosen " + action);
  
    // Take the chosen action
    switch (action) {
        case "pickup":
            client.pickup();
            console.log("pickup");
            break;
        case "putdown":
            client.putdown();
            console.log("putdown");
            break;
        default:
            client.move(action);
            console.log("move");
    }
    console.log("action taken")
  
    // Update the Q-values table
    if (this.lastState !== null && this.lastAction !== null) {
        console.log("updating q value")
      const reward = this.getReward(state, parcels);
      const newState = {
        agent_x: a.x,
        agent_y: a.y,
        parcels: parcels //.map((p) => ({
          //x: p.x,
          //y: p.y,
        //})),
      };
      console.log("reward " + reward);
      this.updateQValue(this.lastState, this.lastAction, reward, newState);
      console.log("q value updated")
    }
  
    // Update last state and action
    this.lastState = state;
    this.lastAction = action;
  }
  

  getReward(state, parcels) {
    const x = state.agent_x;
    const y = state.agent_y;
    console.log("x " + x + " y " + y);
    // Check if we picked up a parcel
    const parcelAtPos = parcels.find((p) => p.x === x && p.y === y);
    if (parcelAtPos) {
      return parcelAtPos.score;
    }

    // Check if we delivered any parcels
    const deliveredParcels = parcels.filter((p) => p.delivered);
    const deliveredScores = deliveredParcels.map((p) => p.score);
    if (deliveredScores.length > 0) {
      return deliveredScores.reduce((sum, score) => sum + score, 0);
    }

    // Otherwise, return a negative reward for moving
    return -0.1;
  }
}
const agent = new QLearningAgent();

async function loop() {
    // Retrieve the list of parcels from the server
    const parcels = client.onParcelsSensing();
  
    // Take an action based on the current list of parcels
    await agent.act(parcels);
  
    // Repeat the loop
    setTimeout(loop(), 1);
  }
  

// Start the loop
import { default as config } from "./config.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
const client = new DeliverooApi(config);
loop();
