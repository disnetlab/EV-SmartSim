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

// EV Charging Infrastructure Types
export type EVSEType = "residential" | "workplace" | "public_ac" | "public_dc" | "depot" | "highway" | "stop";

export interface ChargingPlace {
  id: number;
  name: string;
  position: Position; // [longitude, latitude]
  evse_type: EVSEType;
  max_power_kw: number;
  price_per_kwh?: number; // Optional pricing
  operator?: string; // CPO (Charge Point Operator)
}
