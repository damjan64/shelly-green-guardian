// CONFIGURATION ---------- start
const shellyEnergyMeterIP = "192.168.0.28";   // IP addres of Shelly EM device
const loadSheddingPower = 30; // power from the grid at which a Load Shedding is required
const switchBackPower = 10; // power from the grid at which device is switched on again
const minPowerToEnableLoadShedding = 3; // load power that determines the on state
// CONFIGURATION ---------- end

// setting the URL for reading energy meters
let url = "http://" + shellyEnergyMeterIP +  "/emeter/0";
console.log("URL for Energy Meter reading:", url);

let eventHandlerPtr = 0; // state pointer inside addEventHandler function
let timerHandle = null;  // timer handler
let previousEnergy = 0;  // previous state of the EM for calculating the minute consumption


// ============================================================
// The function determines whether the load should be switched
// ON or OFF, based on the last minute's consumption.
function loadSheddingManagement() {
  Shelly.call("HTTP.GET", {"url": url}, function(result) {
    if ((result != undefined) && (result.message === "OK")) {
      let response = JSON.parse(result.body);
      let totalEnergy = response.total;

      // set previousEnergy on first start when LoadS hedding is enabled
      if (previousEnergy === 0) {
        previousEnergy = totalEnergy;        
      };

      // calculate the previous minute's consumption
      let deltaEnergy = totalEnergy - previousEnergy;
      previousEnergy = totalEnergy;
      deltaEnergy = deltaEnergy * 60;  // convert to hourly for easier monitoring
      console.log("Load Shedding - delta Energy:", deltaEnergy);

      // consumption too high disconnects the load
      if (deltaEnergy >= loadSheddingPower) {
        console.log("Load Shedding - activated")
        Shelly.call("Switch.Set", {id: 0, on: false});
      };
      
      // consumption low enough for reconnect the load
      if (deltaEnergy < switchBackPower) {
        console.log("Load Shedding - deactivated")
        Shelly.call("Switch.Set", {id: 0, on: true});
      };      
 
    } else {
      console.log("Error reading data from Energy Meter with IP:", shellyEnergyMeterIP);
    };
  });   
};


// ============================================================
// addEventHandler function is used to detect 
// change in load status
Shelly.addEventHandler(function(respond) {
  startStopLoadShedding()
});

function startStopLoadShedding() {
  // in principle we can get the data from addEventHandler, but in this case we get
  // output and power at the same time, which makes the implementation a bit easier
  let status = Shelly.getComponentStatus("switch:0");
  let output = status.output;
  let power = status.apower;
  console.log("Controlled device switch state:", output, ", power:", power, "W");

  // We are deciding between two states. In the first one, the load is connected, 
  // so it is necessary to control the overall power consumption. 
  // In the second case, the load is disconnected, and this control is not necessary.
  switch(eventHandlerPtr) {
    case 0:
      if (power >= minPowerToEnableLoadShedding) {
        console.log("Controlled device is ON - start consumption control");
        previousEnergy = 0;
        loadSheddingManagement();
        timerHandle = Timer.set(60 * 1000, true, loadSheddingManagement);
        eventHandlerPtr = 1;
      };
    break;
    case 1:
      if ((power < minPowerToEnableLoadShedding) && (output === true)) {
        console.log("Controlled device is OFF - stop consumption control");
        Timer.clear(timerHandle);
        eventHandlerPtr = 0;        
      };
    break;
  };    
};

// addEventHandler sometimes fails to detect the current state at function 
// start up - added just in case to work right from the start, 
// and not after the first event heppens
startStopLoadShedding();