// Parameter settings
const shellyEnergyMeterIP = "192.168.0.28";   // IP addres of Shelly EM device
const highLoadLimit = 3000;    // High Load Limit in W
const mediumLoadLimit = 2500;  // Medium Load Limit in W
const lowLoadLimit = 1000;     // Low Load Limit in W

const greenColor = [0, 100, 0];
const yellowColor = [100, 100, 0];
const redColor = [100, 0, 0];
const blueColor = [0, 0, 100];
const whiteColor = [100, 100, 100];

let energyHighLoadLimit = highLoadLimit / 60 * 15;
let energyMediumLoadLimit = mediumLoadLimit / 60 * 15;
let energyLowLoadLimit = lowLoadLimit / 60 * 15;
console.log(energyLowLoadLimit, energyMediumLoadLimit, energyHighLoadLimit);

// URL refers to Shelly EM (gen 1 device), modify accordingly 
// if another device is used for energy meetering
let url = "http://" + shellyEnergyMeterIP +  "/emeter/0";
console.log("HTTP.GET url =", url);

let energyPrevious = 0;
let currrentPeriodeMinute = 14;

let switchStatus = Shelly.getComponentStatus("switch:0");
let isSwitchStateOn = switchStatus.output;

// Object for LED control - settings of color and blinking periode
// rgb: LED color
// brightnessLo: lo blinking LED brightness
// brightnessHi: hi blinking  LED brightness
// blinkingTime: blinking periode on Hi
let LED = {
  rgb: {},
  brightnessLo: 0,
  brightnessHi: 0,  
  blinkingTime: 0,
  
  init: function(rgb, brightnessLo, brightnessHi, blinkingTime) {
    this.rgb = rgb;
    this.brightnessLo = brightnessLo;
    this.brightnessHi = brightnessHi;  
    this.blinkingTime = blinkingTime * 1000;
  },
  
  setLedLo: function() {
    if (isSwitchStateOn === true) {
      let config = {"config": {"leds": {"colors": {"switch:0": {"on": {"rgb": this.rgb, "brightness": this.brightnessLo}}}}}};
    } else {
      let config = {"config": {"leds": {"colors": {"switch:0": {"off": {"rgb": this.rgb, "brightness": this.brightnessLo}}}}}};      
    };
    return config;
  },

  setLedHi: function() {
    if (isSwitchStateOn === true) {
      let config = {"config": {"leds": {"colors": {"switch:0": {"on": {"rgb": this.rgb, "brightness": this.brightnessHi}}}}}};
    } else {
      let config = {"config": {"leds": {"colors": {"switch:0": {"off": {"rgb": this.rgb, "brightness": this.brightnessHi}}}}}};      
    };
    return config;
  },  

};

function timerLedLo() {
  Shelly.call("PLUGS_UI.SetConfig", ledIndicator.setLedLo() );
  Timer.clear(timerHandler);
  timerHandler = Timer.set(1000, false, timerLedHi);
}
  
function timerLedHi() {
  Shelly.call("PLUGS_UI.SetConfig", ledIndicator.setLedHi() );
  Timer.clear(timerHandler);
  timerHandler = Timer.set(1000 + (ledIndicator.blinkingTime), false, timerLedLo);
}

// LED initialization, we set white colour and 100% brightness
// LED is white until valid data is obtained from the EM
let ledIndicator = Object.create(LED);
                   //rgb, brightnessLo, brightnessHi, blinkingTime
ledIndicator.init([100, 100, 100], 100, 100, 0);

timerHandler = Timer.set(100, false, timerLedHi);

// function reads data from the energy meter and andaccordingly 
// signals the avaiable power via an RGB LED
function readDataFromEMdevice(result) {
  // verify that data from EM is accepted and correct, 
  // if not generate an error message
  //console.log(result);
  
  
  if ((result != undefined) && (result.message === "OK")) {
    let response = JSON.parse(result.body);
    let power = response.power;

	// for easier representation, we convert the power from watts to kilowatts,
	//  intended only for display on the console
    let kWpower = (power / 1000).toFixed(2);
    let kWavailablePower = ((highLoadLimit - power) / 1000).toFixed(2);
    console.log("Power consumption =", kWpower, "kW, available power =", kWavailablePower, "kW");
   
    // Based on the current consumption state and limits, we determine 
    // the color and flashing for the LED indication
    // These parameters are then used in the timer (2)
    if (power <= lowLoadLimit) {
      ledIndicator.init(greenColor, 100, 100, 0);
    } else if (power <= mediumLoadLimit) {
      ledIndicator.init(yellowColor, 100, 100, 0);
    } else if (power <= highLoadLimit) {
      ledIndicator.init(redColor, 100, 100, 0);
    } else {
      ledIndicator.init(redColor, 5, 100, 0);
    }
    
  } else {
    console.log("Error reading data from Energy Meter with IP:", shellyEnergyMeterIP);
           // rgb, brightnessLo, brightnessHi, blinkingTime
    ledIndicator.init(whiteColor, 100, 100, 0); // set LED glow to white
  };
};

// Timer (1) - read EM data every 10 seconds
// and adjust the LED signalling accordingly
Timer.set(10 * 1000, true, function() {
  if (isSwitchStateOn === false) {
    console.log("Log from timer:",url);
    Shelly.call("HTTP.GET", {"url": url}, readDataFromEMdevice);    
  };
});


Shelly.addEventHandler(function(event) {
  if (event.info.event === "toggle") {
    isSwitchStateOn = event.info.state;
    console.log("Switch state", isSwitchStateOn);
    ledIndicator.init(whiteColor, 100, 100, 0); // set LED glow to white
  };
});


Shelly.addStatusHandler(function(event) {
  if (typeof event.delta.aenergy !== "undefined") {
    // Read the state of the 'sys' component to obtain the current time.
    // Use minutes to determine 15-minute periods for energy calculation.
    let shellyStatus = Shelly.getComponentStatus("sys");
    let minutes = shellyStatus.time.slice(3, 5);

    Shelly.call("HTTP.GET", {"url": url}, function(result) {
      // verify that data from EM is accepted and correct, 
      // if not generate an error message
      if ((result != undefined) && (result.message === "OK")) {
        let response = JSON.parse(result.body);
        let power = response.power;
        let energy = response.total;
        
        currrentPeriodeMinute--;
        
        if ((minutes % 15) === 0) {
          console.log("------ 15 minute section");
          energyPrevious = energy;
          currrentPeriodeMinute = 14;
        };
        
        let energyDifference = energy - energyPrevious;
        
        if (isSwitchStateOn === true) {
          if (energyPrevious != 0) {
            console.log("Current: minute", minutes, ", power", power, ", energy", energy, ", 15-min energy", energyDifference); 
            let blinkingPeriode = 5 * currrentPeriodeMinute / 14;
            
            // Power W / 60 * 15 (ker je na eno uro je vrednost moči in energije enaka))
            // energyHighLoadLimit, energyMediumLoadLimit, energyLowLoadLimit
            
            if (energyDifference < energyLowLoadLimit) {
              ledIndicator.init(greenColor, 5, 100, blinkingPeriode); // set LED glow to white             
            } else if (energyDifference < energyMediumLoadLimit) {
              ledIndicator.init(yellowColor, 5, 100, blinkingPeriode); // set LED glow to white 
            } else if (energyDifference < energyHighLoadLimit) {
              ledIndicator.init(redColor, 5, 100, blinkingPeriode); // set LED glow to white 
            } else {
              ledIndicator.init(blueColor, 5, 100, blinkingPeriode); // set LED glow to white 
            };
          } else {
            console.log("Current: minute", minutes, ", power", power, ", energy", energy);  
            ledIndicator.init(whiteColor, 100, 100, 0); // set LED glow to white
          };
        };
      } else {
        console.log("Error reading data from Energy Meter with IP:", shellyEnergyMeterIP);
        ledIndicator.init(whiteColor, 100, 100, 0); // on error set LED glow to white        
      };
    });
  };
});