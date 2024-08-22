import React, { useState } from 'react';

const SidebarRight = ({ simulationSteps }) => {
  const [currentSteps, setCurrentSteps] = useState(simulationSteps);

  return (
    <div className="sidebar_droite">
      <h2>Simulation Steps</h2>
      <div className="step-list">
        {currentSteps.map((step, index) => (
          <p key={index} className="step-info">
            {step}
          </p>
        ))}
      </div>
    </div>
  );
};

export default SidebarRight;
