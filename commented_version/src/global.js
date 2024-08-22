// global.js
let Id = -1;
let StepId = -1;
let StationId = -1;
// Functions used to set unique Ids for items
export const incrementId = () => {
  Id += 1;
  console.log('new id ', Id);
  return Id;
};

export const incrementStepId = () => {
  StepId += 1;
  console.log('new stepId ', Id);
  return StepId;
};

export const incrementStationId = () => {
  StationId += 1;
  console.log('new station id ', Id);
  return StationId;
};
