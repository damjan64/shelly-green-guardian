// CONFIGURATION ---------- start
// IP addres of Shelly slave device
const shellySlaveIP = "192.168.0.27";   
// Shelly script number for switch heater ON in slave device
const scriptNumberForON = "1";
// Shelly script number for switch heater OFF in slave device
const scriptNumberForOFF = "3";
// The power at which the heater is considered to be ON
const powerWhenHeaterON = 4;
// The power at which the heater is considered to be OFF
const powerWhenHeaterOFF = 0.5;
// time (in ms) after which the heater automatically turns
// off if we forgot to turn it off
const autoStopHeaterTime = 1 * 60 * 1000;
// CONFIGURATION ---------- end

let urlForON = "http://" + shellySlaveIP + "/rpc/Script.Start?id=" + scriptNumberForON;
let urlForOFF = "http://" + shellySlaveIP + "/rpc/Script.Start?id=" + scriptNumberForOFF;
console.log("Start heater url:", urlForON); 
console.log("Stop heater url:", urlForOFF); 

let timerHandle = null;

// ============================================================
// Start a routine in Shelly that is installed in the heater
// that will START the heater
function startHeater() {
  Shelly.call("HTTP.GET", {url: urlForON}, function(respond) {
    console.log("Start heater responde code:", respond.code);
    timerHandle = Timer.set(autoStopHeaterTime, false, autoStopHeater);    
  });
};

// ============================================================
// Start a routine in Shelly that is installed in the heater
// that will STOP the heater
function stopHeater() {
  Shelly.call("HTTP.GET", {url: urlForOFF}, function(respond) {
    console.log("Stop heater responde code:", respond.code);
    Timer.clear(timerHandle);
  });   
};

// ============================================================
// Function decides whether to start or stop the heater based
// on the current consumption.
function startOrStopHeater() {
  let status = Shelly.getComponentStatus("switch:0");
  let power = status.apower; 
  if (power < powerWhenHeaterOFF) {
    startHeater();
  };
  if (power > powerWhenHeaterON) {
    stopHeater();
  };
};

// ============================================================
function autoStopHeater() {
  stopHeater();
};

// ============================================================
// eventcallback function is used to detect press to pushbuttton
Shelly.addEventHandler(function(respond) {
  let event = respond.info.event;
  // short button press starts/stops the heater
  if (event === "single_push") {
    startOrStopHeater();
  };
  // long button press turns on/off the power supply to the heater
  if (event === "long_push") {
    Timer.clear(timerHandle);
    Shelly.call("Switch.Toggle", {id: 0});
  };
});