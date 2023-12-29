// CONFIGURATION ---------- start
let url = "https://api.open-meteo.com/v1/forecast?latitude=45.82&longitude=14.17&current=temperature_2m&timezone=Europe%2FBerlin&forecast_days=1";
let heatOnTemperature = 5; // Temperature to Trigger Heater Activation (st.C)
let heatOffTemperature = 8; // Temperature to Trigger Heater Deactivation (st.C)
let temperatureControlInterval = 1; // Temperature Monitoring Interval (minute)
// CONFIGURATION ---------- end

// Check if number is valid and within a meaningful temperature range.
function isValidTemperature(value) {
  let result = false;
  if (typeof(value) === "number") {
    if ((value > -30) && (value < 40)) {
      result = true;
    };
  };
  return result;  
};

function frostGuardShield() {
  Shelly.call("HTTP.GET", {"url": url}, function(result) {
    if (result != undefined) {
      let response = JSON.parse(result.body);
      temperature = response.current.temperature_2m;
      if (isValidTemperature(temperature) === true) {
        console.log("Outside temperature:", temperature);
        if (heatOnTemperature < heatOffTemperature) {
          if (temperature < heatOnTemperature) {
            console.log("turning on the heater");
            Shelly.call("Switch.Set", {id: 0, on: true});          
          };
          if (temperature > heatOffTemperature) {
            console.log("turning off the heater"); 
            Shelly.call("Switch.Set", {id: 0, on: false});          
            };
          } else {
            console.log("Heat control is blocked: Activation temp. higher than deactivation temp.");
          };     
      } else {
        console.log("Error: something is wrong with the temperature data:", temperature);        
      };
      
    } else {
      console.log("Error: communication with 'https://api.open-meteo.com' failed");
    };
  });
};

// Start immediately upon launch, then
// run periodically according to the timer
frostGuardShield();
Timer.set(temperatureControlInterval * 60 * 1000, true, frostGuardShield);