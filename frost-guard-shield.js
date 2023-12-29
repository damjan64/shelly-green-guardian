// CONFIGURATION ---------- start
let url = "https://api.open-meteo.com/v1/forecast?latitude=45.82&longitude=14.17&current=temperature_2m&timezone=Europe%2FBerlin&forecast_days=1";
let heaterOnTemperature = 3; // Temperature to Trigger Heater Activation (st.C)
let heaterOffTemperature = 5; // Temperature to Trigger Heater Deactivation (st.C)
let temperatureControlInterval = 1; // Temperature Monitoring Interval (minute)
// CONFIGURATION ---------- end

// Retrn value from KVS if exist; if it is not available
// write local value to KVS and retrn lokal values
function readDataFromKVS() {
let kvsValue = 0;

  Shelly.call("KVS.Get", {key: "heaterOnTemperature"}, function(result) {
    if (result != undefined) {
      kvsValue = parseFloat(result.value);
      if (isValidTemperature(kvsValue) === true) {
        heaterOnTemperature = kvsValue;        
      } else {
        errorLog("KVS data error in 'heaterOnTemperature'");       
      };
    } else {
      Shelly.call("KVS.set", {key: "heaterOnTemperature", value: heaterOnTemperature});
    };  
  });
  
  Shelly.call("KVS.Get", {key: "heaterOffTemperature"}, function(result) {
    if (result != undefined) {
      kvsValue = parseFloat(result.value);
      if (isValidTemperature(kvsValue) === true) {
        heaterOffTemperature = kvsValue;        
      } else {
        errorLog("KVS data error in 'heaterOffTemperature'");
      };
    } else {
      Shelly.call("KVS.set", {key: "heaterOffTemperature", value: heaterOffTemperature});
    };  
  });   
};

// --------------------------------------------------
// Function writes the last error message to the KVS
// utc time can be checked on: https://www.unixtimestamp.com/
function errorLog(msg) {
  console.log("Error:", msg); 
  // add UTC time in KVS message 
  let shellyStatus = Shelly.getComponentStatus("sys");
  let utc = shellyStatus.unixtime;
  msg = utc + " - " + msg;
  Shelly.call("KVS.set", {key: "lastErrorState", value: msg});
  // Something went wrong; to prevent any damage, activate the heater as a precaution
  Shelly.call("Switch.Set", {id: 0, on: true});
};

// --------------------------------------------------
// Check if value is valid number and within a meaningful temperature range.
function isValidTemperature(value) {
  let result = false;
  if (typeof(value) === "number") {
    if ((value >= -30) && (value <= 40)) {
      result = true;
    };
  };
  return result;  
};

// --------------------------------------------------
// Heater Control - based on the Outside temperature
// and limits turns the heater on and off
function heaterControl(temperature) {
  console.log("Outside temperature:", temperature, ", heater ON:", heaterOnTemperature, ", heater OFF:", heaterOffTemperature); 
  
  if (heaterOnTemperature < heaterOffTemperature) {
    
    if (temperature <= heaterOnTemperature) {
      console.log("Turning on the heater");
      Shelly.call("Switch.Set", {id: 0, on: true});
    };    
    
    if (temperature > heaterOffTemperature) {
      console.log("Turning off the heater"); 
      Shelly.call("Switch.Set", {id: 0, on: false});          
    };    

  } else {
    errorLog("Heater control is blocked Ton > Toff");    
  };
};

// --------------------------------------------------
// The heater control algorithm reads data from the open-meteo cloud service.
// It checks the correctness of received outside temperature and,
// and if everthing is OK it cals heaterControl.
function frostGuardShield() {
  Shelly.call("HTTP.GET", {"url": url}, function(result) {
    
    if (result != undefined) {
      let response = JSON.parse(result.body);
      let temperature = response.current.temperature_2m;
      
      if (isValidTemperature(temperature) === true) {
        heaterControl(temperature);
      } else {
        errorLog("External temperature value error");
      };
      
    } else {
      errorLog("Communication with 'open-meteo' failed");      
    };
    
  });
};

let timerFsaPtr = 0; //  finite state automaton pointer

// finite state automaton for timer
// used for periodically executing the frostGuardShield
function timerFSA() {
  switch(timerFsaPtr) {
    // because of asinchronius access of KVS data 
    // this is 1 second delay as work around to get data from KVS
    case 0: // read data from KVS
      readDataFromKVS();
      timerFsaPtr = 1;
      Timer.set(1000, false, timerFSA);
    break;
  
    case 1:  // wait for data from KVS and start heater control
      frostGuardShield(); 
      timerFsaPtr = 0;
      Timer.set(temperatureControlInterval * 60 * 1000, false, timerFSA);
    break;
  };
};

// kick timerFSA
timerFSA();