import { default as config } from "./config.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(config.host, config.token)

//0 are walls
//1 are walkable tiles
//2 are delivery tiles

// max coordinates of the map
var maxX = 0;
var maxY = 0;

var mapData; // the map as a 2D array

client.onConfig((config) => {
    console.log(config);
});
var delivery_points_num=0;
var walkable_points_num=0;
client.onMap((width, height, tiles) => {
    maxX = width;
    maxY = height;

    mapData = new Array(maxX).fill(0).map(() => new Array(maxY).fill(0));

    tiles.forEach((tile) => {
        mapData[tile.x][tile.y] = tile.delivery ? 2 : 1;
        if(tile.delivery){
            delivery_points_num++;
        }
        walkable_points_num++;
    });

    console.log(mapData);
});

number_of_agents = 1;
// divide the map in number_of_agents pieces, each agent will work on a piece of the map (remember that at least one delivery point is needed for each agent)
if (delivery_points_num < number_of_agents){
    console.log("Not enough delivery points for the number of agents");
    process.exit(1);
}
raw_tiles_num = maxX*maxY;
tiles_per_agent = Math.ceil(raw_tiles_num/number_of_agents);

raw_square_per_agent = Math.ceil(Math.sqrt(tiles_per_agent));

// define the starting point for each agent
// todo refactoring using agents ID
starting_points = new Map();
for (let i = 0; i < number_of_agents; i++) {
    starting_points.set(i, new Array(2));
}
starting_points.get(0) = [0,0];
for (let i = 1; i < number_of_agents; i++) {
    starting_points.get(i) = [starting_points.get(i-1)[0]+raw_square_per_agent,starting_points.get(i-1)[1]+raw_square_per_agent];
}

// define the ending point for each agent, that are the max coordinates of the map thy can reach
ending_points = new Map();
for (let i = 0; i < number_of_agents; i++) {
    ending_points.set(i, new Array(2));
}
ending_points.get(0) = [raw_square_per_agent,raw_square_per_agent];
for (let i = 1; i < number_of_agents; i++) {
    ending_points.get(i) = [ending_points.get(i-1)[0]+raw_square_per_agent,ending_points.get(i-1)[1]+raw_square_per_agent];
}

// check if there is at least one delivery point in each agent's area, TODO remove O(N^2)
for (let i = 0; i < number_of_agents; i++) {
    let delivery_points_in_area = 0;
    for (let j = starting_points.get(i)[0]; j < ending_points.get(i)[0]; j++) {
        for (let k = starting_points.get(i)[1]; k < ending_points.get(i)[1]; k++) {
            if (mapData[j][k] == 2){
                delivery_points_in_area++;
            }
        }
    }
    if (delivery_points_in_area == 0){
        console.log("No delivery points in agent "+i+" area");
        process.exit(1);
    }
}


// function to send an agent to a point in the map
async function sendAgent(agent, x, y){
    console.log("Sending agent "+agent.id+" to point "+x+","+y);
    // get current position
    var position = {}
    agent.onYou(response => {
        position.x = response.x;
        position.y = response.y;
        console.log("Agent "+agent.id+" is at "+x+","+y);
    });
    // loop to move the agent to the point
    while (position.x != x || position.y != y){
        // get a random move between up, down, left and right
        var move = ["right", "left", "up", "down"][Math.floor(Math.random() * 4)];
        if (position.x < x){
            move = "right"
        }
        if (position.x > x){
            move = "left"
        }
        if (position.y < y){
            move = "down"
        }
        if (position.y > y){
            move = "up"
        }
        await agent.move(move);
        // if the agent is stuck, try to move in another direction


    }

}