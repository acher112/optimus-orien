import React from 'react';

interface FeatureLockedScreenProps {
  featureName?: string;
  description?: string;
  requiredPlan?: string;
  onUpgrade?: () => void;
  featuresIncluded?: string[];
}

export const FeatureLockedScreen: React.FC<FeatureLockedScreenProps> = () => {
  // All plan restrictions deactivated - every feature is free and accessible
  return null;
};

export default FeatureLockedScreen;
