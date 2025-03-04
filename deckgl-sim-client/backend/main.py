from fastapi import FastAPI
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, validator

class Position(BaseModel):
   latitude: float
   longitude: float

class VehicleStep(BaseModel):
   type: str
   destination: dict
   soc: float
   totalDistanceMeter: int
   totalTimeMS: int
   routes: list[Position]
   distanceProgression: list[float]
   vehicleProgressionMS: list[int]

   @validator('type')
   def check_type(cls, v):
       if v not in ["trip", "stop", "cdc", "init"]:
           raise ValueError("Invalid type")
       return v

class Vehicle(BaseModel):
   id: int
   batteryCapacityKWH: float
   steps: list[VehicleStep]
   run: dict
   selected: bool

   @validator('run')
   def check_run(cls, v):
       if not isinstance(v, dict) or 'progression' not in v or 'position' not in v or 'heading' not in v:
           raise ValueError("Invalid run structure")
       return v

app = FastAPI()

@app.post("/vehicles")
async def EVSmartSim_Sample_API(vehicle: Vehicle):


    return {"message": "EVSmartSim Sample API", "received_data": vehicle.dict()}

if __name__ == "__main__":
   import uvicorn
   uvicorn.run(app, host="0.0.0.0", port=8000)
