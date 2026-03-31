import React from 'react';
import { Badge } from '@shopify/polaris';

const STATUS_MAP = {
  'Pending':                 { tone: undefined,   label: 'Pending' },
  'Sending':                 { tone: 'info',      label: 'Sending…' },
  'Sent':                    { tone: 'success',   label: 'Sent ✓' },
  'Completed':               { tone: 'success',   label: 'Completed ✓' },
  'Skipped':                 { tone: undefined,   label: '↩️ Skipped' },
  'Failed - Order Error':    { tone: 'critical',  label: 'Failed - Order' },
  'Failed - Email Error':    { tone: 'critical',  label: 'Failed - Email' },
  'Failed - Complete Error': { tone: 'critical',  label: 'Failed - Complete' },
  'Failed':                  { tone: 'critical',  label: 'Failed ✗' }
};

export default function StatusBadge({ status }) {
  const config = STATUS_MAP[status] || { tone: undefined, label: status || 'Unknown' };

  return (
    <Badge tone={config.tone}>
      {config.label}
    </Badge>
  );
}
