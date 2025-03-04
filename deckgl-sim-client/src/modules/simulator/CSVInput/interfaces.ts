import { Dayjs } from "dayjs";
import { Position } from "deck.gl";

export interface VehicleStep {
  type: "trip" | "stop" | "cdc" | "init";
  destination: {
    position: Position;
    time?: Dayjs;
  };
  soc: number;
  totalDistanceMeter: number;
  totalTimeMS: number;
  routes: Position[];
  distanceProgression: number[];
  vehicleProgressionMS: number[];
}

export interface Vehicle {
  id: number;
  label: string;
  batteryCapacityKWH: number;
  steps: VehicleStep[];
  run: {
    progression: number;
    position: Position;
    heading: number;
  };
  selected: boolean;
}
