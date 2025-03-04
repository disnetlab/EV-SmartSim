import { saveAs } from "file-saver"; // You might need to install: npm install file-saver
import { Vehicle, VehicleStep } from "./interfaces";
import { Dayjs } from "dayjs";
import dayjs from "dayjs"; // Import dayjs itself
import customParseFormat from "dayjs/plugin/customParseFormat"; // Import the plugin
dayjs.extend(customParseFormat); // Use the plugin

/**
 * Downloads Vehicle and VehicleStep data as two separate CSV files.
 *
 * @param {Vehicle[]} vehicles An array of Vehicle objects.
 */
export const downloadVehicleDataAsCSV = (vehicles: Vehicle[]): void => {
  if (!vehicles || vehicles.length === 0) {
    console.warn("No vehicle data to download.");
    return;
  }

  // 1. Prepare Vehicle data
  const vehicleHeader = "id\n"; // CSV header for vehicle data
  const vehicleRows = vehicles.map((vehicle) => `${vehicle.id}\n`).join("");
  const vehicleCSVContent = vehicleHeader + vehicleRows;

  // 2. Prepare VehicleStep data
  const stepHeader =
    "vehicle_id,step_type,destination_time,destination_long,destination_lat,soc,routes\n";
  const stepRows = vehicles
    .flatMap((vehicle) =>
      vehicle.steps.map((step) => {
        const timeTo = step.destination.time
          ? step.destination.time instanceof Date
            ? step.destination.time.toISOString()
            : (step.destination.time as Dayjs).toISOString()
          : "";
        const destinationLong = step.destination.position[0];
        const destinationLat = step.destination.position[1];
        const routesString = step.routes ? JSON.stringify(step.routes) : ""; // Handle routes as JSON string

        return `${vehicle.id},${step.type},${timeTo},${destinationLong},${destinationLat},${step.soc},"${routesString}"\n`;
      }),
    )
    .join("");
  const stepCSVContent = stepHeader + stepRows;

  // 3. Create Blobs
  const vehicleBlob = new Blob([vehicleCSVContent], {
    type: "text/csv;charset=utf-8",
  });
  const stepBlob = new Blob([stepCSVContent], {
    type: "text/csv;charset=utf-8",
  });

  // 4. Download the files using FileSaver.js
  saveAs(vehicleBlob, "vehicle_data.csv");
  saveAs(stepBlob, "vehicle_steps_data.csv");
};

/**
 * Imports Vehicle and VehicleStep data from two separate CSV files.
 *
 * @param {File} vehicleFile The Vehicle data CSV file.
 * @param {File} stepFile The VehicleStep data CSV file.
 * @param {(vehicles: Vehicle[]) => void} callback A callback function to be called with the imported vehicles.
 */
export const importVehicleDataFromCSV = (
  vehicleFile: File,
  stepFile: File,
  callback: (vehicles: Vehicle[]) => void,
): void => {
  const readVehicleData = (file: File): Promise<{ id: number }[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split("\n");
        const header = lines.shift(); // Remove header row
        if (!header?.startsWith("id")) {
          reject(
            new Error(
              "Invalid vehicle data CSV format: Missing or incorrect header.",
            ),
          );
          return;
        }

        const vehicleData = lines
          .filter((line) => line.trim() !== "") // Remove empty lines
          .map((line) => {
            const [id] = line.split(",");
            return { id: parseInt(id, 10) };
          });
        resolve(vehicleData);
      };
      reader.onerror = () => {
        reject(new Error("Failed to read vehicle data file."));
      };
      reader.readAsText(file);
    });
  };

  const readStepData = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split("\n");
        const header = lines.shift(); // Remove header row

        if (!header?.startsWith("vehicle_id")) {
          reject(
            new Error(
              "Invalid step data CSV format: Missing or incorrect header.",
            ),
          );
          return;
        }

        const stepData = lines
          .filter((line) => line.trim() !== "") // Remove empty lines
          .map((line) => {
            const [
              vehicle_id,
              step_type,
              time_from,
              time_to,
              destination_long,
              destination_lat,
              soc,
              routes,
            ] = line.split(",");

            const parsedRoutes = routes ? JSON.parse(routes) : [];

            return {
              vehicle_id: parseInt(vehicle_id, 10),
              step_type,
              time_from,
              time_to,
              destination_long: parseFloat(destination_long),
              destination_lat: parseFloat(destination_lat),
              soc: parseFloat(soc),
              routes: parsedRoutes,
            };
          });
        resolve(stepData);
      };
      reader.onerror = () => {
        reject(new Error("Failed to read step data file."));
      };
      reader.readAsText(file);
    });
  };

  Promise.all([readVehicleData(vehicleFile), readStepData(stepFile)])
    .then(([vehicleData, stepData]) => {
      const vehicles: Vehicle[] = vehicleData.map((vehicleInfo) => {
        const steps: VehicleStep[] = stepData
          .filter((step) => step.vehicle_id === vehicleInfo.id)
          .map((step) => ({
            type: step.step_type,
            destination: {
              position: {
                latitude: step.destination_lat,
                longitude: step.destination_long,
              },
              time:
                step.time_to === "START"
                  ? undefined
                  : step.time_to
                    ? dayjs(step.time_to).toDate()
                    : undefined, //Parse to Date
            },
            soc: step.soc,
            totalDistanceMeter: 0, // These values are not in the CSV
            totalTimeMS: 0, // You might need to calculate them
            routes: step.routes,
            distanceProgression: [], // These values are not in the CSV
            vehicleProgressionMS: [], // You might need to calculate them
          }));

        return {
          id: vehicleInfo.id,
          label: `Vehicle ${vehicleInfo.id}`, // You might want to fetch this from somewhere else
          batteryCapacityKWH: 100, // You might want to fetch this from somewhere else
          steps: steps,
          run: {
            progression: 0,
            position: { latitude: 0, longitude: 0 }, // You might want to fetch this from somewhere else
            heading: 0, // You might want to fetch this from somewhere else
          },
          selected: false, // You might want to fetch this from somewhere else
        };
      });

      console.log("Imported Vehicles:", vehicles);
      callback(vehicles); // Call the callback with the imported vehicles
    })
    .catch((error) => {
      console.error("Error importing data:", error);
      alert(`Error importing data: ${error.message}`); //Inform the user

      // Optionally, you could call the callback with an empty array or an error state.
      callback([]);
    });
};
