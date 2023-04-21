import { default as config } from "./config.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(config.host, config.token)

var maxX = 0;
var maxY = 0;
var mapData = new Array();

//TODO: Substitute setTimeout with a promise or something similar if possible

await client.onTile((x, y, delivery) => {
    //Update the max coordiantes of the map to know its size
    if (x > maxX) {
        maxX = x;
    }
    if (y > maxY) {
        maxY = y;
    }
    //console.log(x, y, delivery);

    //Push every tile in the mapData array
    mapData.push(x + "-" + y + "-" + delivery);
});

setTimeout(() => {
    //Create the map and the varaible k used to iterate the mapData array
    var map = new Array(maxX);
    //Iterator for the mapData array
    var k = 0;

    for (var i = 0; i <= maxX; i++) {
        //Create the current column of the map
        var currentColumn = new Array(maxY);
        for (var j = 0; j <= maxY; j++) {

            //Get the next tile coordinates
            if (k < mapData.length) {
                var nextX = mapData[k].split('-')[0];
                var nextY = mapData[k].split('-')[1];
            }

            //Check if the current tile is the next tile in the mapData array, otherwise it's a wall and write B
            if (nextX == i && nextY == j) {
                currentColumn[j] = mapData[k].split('-')[2];
                k++;
            } else {
                currentColumn[j] = "B";
            }
        }
        //Push the current column in the map
        map[i] = currentColumn;
    }
    console.log(map);
}, 1000);