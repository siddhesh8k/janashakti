import { memo } from 'react';
import { severityStyle } from '../theme/components';

function SeverityBadge({ severity }) {
  return (
    <span style={severityStyle(severity)}>
      {severity}
    </span>
  );
}

export default memo(SeverityBadge);
