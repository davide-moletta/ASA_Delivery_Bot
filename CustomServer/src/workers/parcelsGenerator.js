const Grid = require('../deliveroo/Grid');
const Tile =  require('../deliveroo/Tile');
const myClock =  require('../deliveroo/Clock');
const config =  require('../../config');



const PARCELS_GENERATION_INTERVAL = process.env.PARCELS_GENERATION_INTERVAL || config.PARCELS_GENERATION_INTERVAL || '2s';
const PARCELS_MAX = process.env.PARCELS_MAX || config.PARCELS_MAX || 'infinite';



module.exports = function (grid) {
 grid.createParcel( 15, 15 );
}