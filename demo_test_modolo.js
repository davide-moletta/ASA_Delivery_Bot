import { default as config } from "./config.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(config.host, config.token)

var maxX = 0;
var maxY = 0;

// set of points
var points = new Set();
// dictionary of deliery points with key = point and value = delivery
var deliveryPoints = new Set();

//Request to the server every tile present in the map
client.onTile((x, y, delivery) => {
    //Update the max coordiantes of the map to know its size
    maxX = x > maxX ? x : maxX;
    maxY = y > maxY ? y : maxY;

    //Push every tile in the mapData array
    points.add((x,y))
    if(delivery == "true")
        deliveryPoints.add((x,y))
});

setTimeout(() => {
    // create a matrix maxX x maxY and fill with 0 
    var mapData = new Array(maxX+1).fill(0).map(() => new Array(maxY+1).fill(0));
    points.forEach((point) => {
        mapData[point[0]][point[1]] = 1;
    });
    // if a point is in deliveryPoints set it to 2
    deliveryPoints.forEach((point) => {
        mapData[point[0]][point[1]] = 2;
    });
}, 500);