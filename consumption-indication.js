// CONFIGURATION ---------- start
// IP addres of "Shelly EM" device
const shellyEnergyMeterIP = "192.168.0.28";   

// Settings for "mode off" - device relay is OFF
// limits for current power consumption
const highLoadLimit = 29;    // High power limit in W
const mediumLoadLimit = 23;  // Medium power limit in W
const lowLoadLimit = 16;     // Low power limit in W

// Settings for "mode on" - device relay is ON
// limits for 15-minute energy consumption
let energyHighLoadLimit = highLoadLimit / 60;
let energyMediumLoadLimit = mediumLoadLimit / 60;
let energyLowLoadLimit = lowLoadLimit / 60;
// CONFIGURATION ---------- end

// URL refers to Shelly EM (gen 1 device), modify accordingly 
// if another device is used for energy meetering
let url = "http://" + shellyEnergyMeterIP +  "/emeter/0";
// print out to console for debugging purpose
console.log("HTTP.GET url =", url);

// **************************************************
//          Setting of "mode on" or "mode off" 
//        mode depends on the state of the switch
// **************************************************
// Set mode at script start-up
let switchStatus = Shelly.getComponentStatus("switch:0");
let isSwitchStateOn = switchStatus.output;

// Set mode during operation with addEventHandler
Shelly.addEventHandler(function(event) {
  if (event.info.event === "toggle") {
    isSwitchStateOn = event.info.state;
    console.log("Changed Switch/mode state:", isSwitchStateOn);
    // on mode change set LED glow to white
    ledIndicator.init([100, 100, 100], 100, 100, 0); 
  };
});

// **************************************************
//              Object for LED control
// **************************************************
// set the lighting parameters in 'init' function
// then get LED configuration via 'setLedLo' or 'setLedHi' 
let LED = {
  rgb: {}, // rgb definition for LED color
  brightnessLo: 0, // blinking - definition of brightness during LED pause 
  brightnessHi: 0, // blinking - definition of brightness during LED pulse
  blinkingTime: 0, // blinking - time in s for led pulse

  // setting requirements for LED lighting
  init: function(rgb, brightnessLo, brightnessHi, blinkingTime) {
    this.rgb = rgb;
    this.brightnessLo = brightnessLo;
    this.brightnessHi = brightnessHi;  
    this.blinkingTime = blinkingTime * 1000; // time in sec.
  },

  // calculation of LED parameters for pause time
  setLedLo: function() {
    if (isSwitchStateOn === true) {
      let config = {"config": {"leds": {"colors": {"switch:0": {"on": {"rgb": this.rgb, "brightness": this.brightnessLo}}}}}};
    } else {
      let config = {"config": {"leds": {"colors": {"switch:0": {"off": {"rgb": this.rgb, "brightness": this.brightnessLo}}}}}};      
    };
    return config;
  },

  // calculation of LED parameters for periode time
  setLedHi: function() {
    if (isSwitchStateOn === true) {
      let config = {"config": {"leds": {"colors": {"switch:0": {"on": {"rgb": this.rgb, "brightness": this.brightnessHi}}}}}};
    } else {
      let config = {"config": {"leds": {"colors": {"switch:0": {"off": {"rgb": this.rgb, "brightness": this.brightnessHi}}}}}};      
    };
    return config;
  },  
};

// The timer alternately stops and starts, allowing us
// to determine the length of the pause and the length of the pulse.
// PAUSE is always 1 second long
function timerLedLo() {
  Shelly.call("PLUGS_UI.SetConfig", ledIndicator.setLedLo() );
  Timer.clear(timerHandler);
  timerHandler = Timer.set(1000, false, timerLedHi);
}

// PULSE - minimum 1 second + ledIndicator.blinkingTime 
// if blinkingTime = 0 we have a blink ratio of 1s to 1s
function timerLedHi() {
  Shelly.call("PLUGS_UI.SetConfig", ledIndicator.setLedHi() );
  Timer.clear(timerHandler);
  timerHandler = Timer.set(1000 + (ledIndicator.blinkingTime), false, timerLedLo);
}

// LED initialization
// color is white and 100% brightness until valid data is obtained from the EM
let ledIndicator = Object.create(LED);
                //rgb, brightnessLo, brightnessHi, blinkingTime
ledIndicator.init([100, 100, 100], 100, 100, 0);

// start of blinking timer
timerHandler = Timer.set(100, false, timerLedHi);

// **************************************************
// processing mode off - device relay is OFF
// LED indication is updated every 10 seconds with a
// color representing the current power consumption
// **************************************************

// function reads data from the energy meter and andaccordingly 
// signals the avaiable power via an RGB LED
function readDataFromEMdevice(result) {
  // verify that data from EM is accepted and correct, 
  // if not generate an error message and turn LED color to white
  //console.log(result);
  if ((result != undefined) && (result.message === "OK")) {
    let response = JSON.parse(result.body);
    let power = response.power;

	// display on the console
    let availablePower = highLoadLimit - power;
    console.log("Power consumption =", power, "W, available power =", availablePower, "W");
   
    // Based on the current consumption state and limits, we determine 
    // the color and flashing for the LED indication
    // These parameters are then used in the blinking timer
    if (power <= lowLoadLimit) {
      ledIndicator.init([0, 100, 0], 100, 100, 0);
    } else if (power <= mediumLoadLimit) {
      ledIndicator.init([100, 100, 0], 100, 100, 0);
    } else if (power <= highLoadLimit) {
      ledIndicator.init([100, 0, 0], 100, 100, 0);
    } else {
      ledIndicator.init([0, 0, 100], 5, 100, 0);
    }
    
  } else {
    console.log("Error reading data from Energy Meter with IP:", shellyEnergyMeterIP);
           // rgb, brightnessLo, brightnessHi, blinkingTime
    ledIndicator.init([100, 100, 100], 100, 100, 0); // Error set LED glow to white
  };
};

// Timer read EM data every 10 seconds
// and adjust the LED signalling accordingly
Timer.set(10 * 1000, true, function() {
  if (isSwitchStateOn === false) {
    Shelly.call("HTTP.GET", {"url": url}, readDataFromEMdevice);    
  };
});

// **************************************************
// processing mode on - device relay is ON
// we display the energy consumption state over a
// 15-minute period updated every full minute
// **************************************************
// Pay attention, the first minute is always green 
// because that's when the energy counter resets.

let energyPrevious = 0; // previousby minute energy to calculate delta
let energyDifference = 0; // last minute calculated energa
let currrentPeriodeMinute = 0; // counter of current minutes within a 15-minute interval
let blinkingPeriode = 0; // Length of LED blinking within a 15-minute period

// To synchronize with real time clock, we use addStatusHandler, 
// which updates the energy data "aenergy" every full minute. 
Shelly.addStatusHandler(function(event) {
  if (isSwitchStateOn === true) {
    if (typeof event.delta.aenergy !== "undefined") {
    // ----------------------------------------------
      // Read the state of the 'sys' component to get current time.
      // Extract minutes for further processing.
      let shellyStatus = Shelly.getComponentStatus("sys");
      let minutes = shellyStatus.time.slice(3, 5);
      
      // Read data from Shelly EM
      Shelly.call("HTTP.GET", {"url": url}, function(result) {
        // verify that data from EM is accepted and correct, 
        // if not generate an error message and turn LED to white
        if ((result != undefined) && (result.message === "OK")) {
          let response = JSON.parse(result.body);
          let power = response.power;
          let energy = response.total;

          currrentPeriodeMinute = minutes % 15;
         
          if (currrentPeriodeMinute === 0) {
            console.log("--------- new 15 minute section ---------");
            energyPrevious = energy;
          };
          
          if (energyPrevious != 0) {

            blinkingPeriode = 5 * (14 - currrentPeriodeMinute) / 14;
            energyDifference = energy - energyPrevious;
            
            // calculate dynamic limits
            let Low = energyLowLoadLimit * currrentPeriodeMinute;
            let Mid = energyMediumLoadLimit * currrentPeriodeMinute;
            let High = energyHighLoadLimit  * currrentPeriodeMinute;

            console.log("(", currrentPeriodeMinute, ") - power:", power, ", last minutes delta energy:", energyDifference, ", extended blinking time:", blinkingPeriode);
            console.log("... dynamic limits: Lo =", Low, ", Med =", Mid, ", Hi =", High); 
            
            // set LED colors
            if (energyDifference <= Low) {
              ledIndicator.init([0, 100, 0], 5, 100, blinkingPeriode); // set LED to green             
            } else if (energyDifference < (Mid)) {
              ledIndicator.init([100, 100, 0], 5, 100, blinkingPeriode); // set LED to yellow 
            } else if (energyDifference < (High)) {
              ledIndicator.init([100, 0, 0], 5, 100, blinkingPeriode); // set LED to red 
            } else {
              ledIndicator.init([0, 0, 100], 5, 100, blinkingPeriode); // set LED to blue
            }; 

          } else {
            console.log("Waiting for the 15 minute start - current minute:", currrentPeriodeMinute);
            ledIndicator.init([100, 100, 100], 100, 100, 0); // data not available yet, set LED to white
          }; 
         
        } else {
          console.log("Error reading data from Energy Meter with IP:", shellyEnergyMeterIP);
          ledIndicator.init([100, 100, 100], 100, 100, 0); // Error with EM communication, set LED to white
        };  
      });          
    // ----------------------------------------------  
    };
  };
});