import React from 'react';

const StepList = ({ steps }) => {
  return (
    <div className="step-list">
      <h2>Steps</h2>
      <ul>
        {steps.map((step, index) => (
          <li key={index} className={`step-${step.stepType}`}>
            Type: {step.stepType}, Vehicle: {step.vehicleName},
            {step.stepType === 'trip' ? ` Destination: ${step.stationName}` : ` Station: ${step.stationName}`}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default StepList;
