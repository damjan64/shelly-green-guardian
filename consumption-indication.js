// Parameter settings
const shellyEnergyMeterIP = "192.168.0.28";   // IP addres of Shelly EM device
const highLoadLimit = 3000;    // High Load Limit in W
const mediumLoadLimit = 2500;  // Medium Load Limit in W
const lowLoadLimit = 1000;     // Low Load Limit in W

// URL refers to Shelly EM (gen 1 device), modify accordingly 
// if another device is used for energy meetering
let url = "http://" + shellyEnergyMeterIP +  "/emeter/0";


// Object for LED control - settings of flashing and colour
// rgb: LED color
// toggle = false: non blinking LED
// toggle = true: LED blinking between brightnessMin and brightnessMax
// brightness: LED brightness
let LED = {
  rgb: {},
  toggle: false,
  brightnessMin: 0,
  brightnessMax: 0,  
  brightness: 0,
  
  init: function(rgb, toggle, brightnessMin, brightnessMax) {
    this.rgb = rgb;
    this.toggle = toggle;
    this.brightnessMin = brightnessMin;
    this.brightnessMax = brightnessMax;  
    this.brightness = brightnessMax; // set brightness to max at initialization
  },
  
  setLedProperties: function(rgb, toggle) {
    this.rgb = rgb;
    this.toggle = toggle;
  },
  
  // by calling the function, we send the settings to LED and at the same time 
  // we change the brightness variable in case flashing is required (toggle = true)
  updateLedStatus: function() {
    if (this.toggle === false) {
      this.brightness = this.brightnessMax;
    } else {
      if (this.brightness === this.brightnessMax) {
        this.brightness = this.brightnessMin;
      } else {
        this.brightness = this.brightnessMax;
      };
    };
    let config = {"config": {"leds": {"colors": {"switch:0": {"on": {"rgb": this.rgb, "brightness": this.brightness}}}}}};
    Shelly.call("PLUGS_UI.SetConfig", config);    
  },
};


// function reads data from the energy meter and andaccordingly 
// signals the avaiable power via an RGB LED
function readDataFromEMdevice (result) {

  // verify that data from EM is accepted and correct, 
  // if not generate an error message
  if ((result != undefined) && (result.message === "OK")) {
    let response = JSON.parse(result.body);
    let power = response.power;
	
	power = power * 100; // HARDCODED ---------------------------------

	// for easier representation, we convert the power from watts to kilowatts,
	//  intended only for display on the console
    let kWpower = (power / 1000).toFixed(2);
    let kWavailablePower = ((highLoadLimit - power) / 1000).toFixed(2);
    console.log("Power consumption =", kWpower, "kW, available power =", kWavailablePower, "kW");
   
    // Based on the current consumption state and limits, we determine 
    // the color and flashing for the LED indication
    // These parameters are then used in the timer (2)
    if (power <= lowLoadLimit) {
      onLed.setLedProperties([0, 100, 0], false);
    } else if (power <= mediumLoadLimit) {
      onLed.setLedProperties([100, 100, 0], false);      
    } else if (power <= highLoadLimit) {
      onLed.setLedProperties([100, 0, 0], false);          
    } else {
      onLed.setLedProperties([100, 0, 0], true);          
    }
    
  } else {
    console.log("Error reading data from Energy Meter with IP:", shellyEnergyMeterIP);
    onLed.init([100, 100, 100], false, 10, 100); // set LED glow to white
  };
};


// LED initialization, we set white colour and 100% brightness
// LED is white until valid data is obtained from the EM
let onLed = Object.create(LED);
onLed.init([100, 100, 100], false, 10, 100);


// Timer (1) - read EM data every 10 seconds
// and adjust the LED signalling accordingly
Timer.set(10 * 1000, true, function() {
  Shelly.call("HTTP.GET", {"url": url}, readDataFromEMdevice);
});


// Timer (2) - updates the LED lighting status, 
// timer period (1 second) is also the flashing period
Timer.set(1000, true, function() {
  onLed.updateLedStatus();
});