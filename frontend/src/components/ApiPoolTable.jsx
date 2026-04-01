import React, { useState } from 'react';
import { Card, DataTable, Badge, Button, InlineStack, BlockStack, Text } from '@shopify/polaris';
import { resetApiUsage, resetAllApis } from '../utils/apiClient';

export default function ApiPoolTable({ stores, onRefresh }) {
  const [resettingId, setResettingId] = useState(null);
  const [resettingAll, setResettingAll] = useState(false);

  const handleReset = async (apiId) => {
    try {
      setResettingId(apiId);
      await resetApiUsage(apiId);
      onRefresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setResettingId(null);
    }
  };

  const handleResetAll = async () => {
    try {
      setResettingAll(true);
      await resetAllApis();
      onRefresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setResettingAll(false);
    }
  };

  const rows = stores.map((store) => {
    const isExhausted = store.is_exhausted === 1 || store.usage_count >= store.max_orders;
    const remaining = store.max_orders - store.usage_count;

    let statusBadge;
    if (isExhausted) {
      statusBadge = <Badge tone="new">Done ✓</Badge>; // visually greyed out normally, 'new' might be grey or transparent depending on polaris version
    } else if (store.is_active === 1 && store.usage_count > 0 && !isExhausted) {
      statusBadge = (
        <Badge tone="success">
          <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#34d399', borderRadius: '50%', marginRight: '6px', animation: 'pulse 2s infinite' }} />
          Active
        </Badge>
      );
    } else {
      statusBadge = <Badge tone="info">Waiting</Badge>;
    }

    return [
      store.priority,
      <Text fontWeight="bold">{store.api_name}</Text>,
      `${store.usage_count}/${store.max_orders}`,
      remaining,
      statusBadge,
      <Button size="micro" onClick={() => handleReset(store.id)} loading={resettingId === store.id}>Reset Usage</Button>
    ];
  });

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingMd" as="h2">API Pool Priority</Text>
          <Button onClick={handleResetAll} loading={resettingAll} tone="critical" size="slim">Reset All APIs</Button>
        </InlineStack>

        {stores.length === 0 ? (
          <Text tone="subdued">No API keys added yet.</Text>
        ) : (
          <>
            <style>{`
              @keyframes pulse {
                0% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.5; transform: scale(1.2); }
                100% { opacity: 1; transform: scale(1); }
              }
            `}</style>
            <DataTable
              columnContentTypes={['numeric', 'text', 'text', 'numeric', 'text', 'text']}
              headings={['Priority', 'API Name', 'Used', 'Remaining', 'Status', 'Actions']}
              rows={rows}
            />
          </>
        )}
      </BlockStack>
    </Card>
  );
}
