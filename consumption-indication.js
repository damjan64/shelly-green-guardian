// Parameter settings
const _IP = "192.168.0.28";   // IP addres of Shelly EM

// Consumption limits
const _P_ALRM = 3000; // lower than 3 kW - red light
const _P_WRN = 2000;  // lower than 2 kW - yellow light
const _P_MIN = 1000;  // lower than 1 kW - green light

let url = "http://" + _IP + "/emeter/0";
let ledBlinkFSA = false;
let ledBlink = false;

function ledBrightness(brightness) {
  let config = {"config": {"leds": {"colors": {"switch:0": {"on": {"brightness": brightness}}}}}};
  Shelly.call("PLUGS_UI.SetConfig", config);
}

function ledCollor(rgb) {
  let config = {"config": {"leds": {"colors": {"switch:0": {"on": {"rgb": rgb}}}}}};
  Shelly.call("PLUGS_UI.SetConfig", config);
}

function readEMdata(result) {
  if ((result != undefined) && (result.message === "OK")) {

    let response = JSON.parse(result.body);
    let power = response.power;
    
    power = power * 100; // HARDCODED ---------------------------------
    
    console.log("Pmax =", _P_ALRM, "W, P =", power, "W, Pfree =", _P_ALRM-power);
  
    if (power < _P_MIN) {          // green
      ledCollor([0, 100, 0]);          
      ledBlink = false;    
    } else if (power < _P_WRN) {   // yellow
      ledCollor([100, 40, 0]);
      ledBlink = false;      
    } else if (power < _P_ALRM) {   // red
      ledCollor([100, 0, 0]);      
      ledBlink = false;      
    } else {                        // blink. red
      ledCollor([100, 0, 0]);
      ledBlink = true;                      
    };      
  } else {
    console.log("Error reading from Energy Meter with IP:", _IP);
  };
};

Timer.set(10 * 1000, true, function() {
  console.log(url)
  Shelly.call("HTTP.GET", {"url": url}, readEMdata);
});


Timer.set(1000, true, function() {
  if (ledBlink === true) {
    if (ledBlinkFSA === true) {
      ledBrightness(100);    
    } else {
      ledBrightness(10);
    };
    ledBlinkFSA = !ledBlinkFSA;
  } else {
    ledBrightness(100);
  };
});