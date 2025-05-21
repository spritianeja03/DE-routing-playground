"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card"; // Removed unused CardHeader, CardTitle, CardDescription
import type { MerchantConnector } from "@/lib/types"; // Import from global types

interface MerchantConnectorListProps {
  connectors: MerchantConnector[];
  toggleStates: Record<string, boolean>;
  onToggleChange: (connectorId: string, newState: boolean) => void;
}

export function MerchantConnectorList({
  connectors,
  toggleStates,
  onToggleChange,
}: MerchantConnectorListProps) {
  if (!connectors || connectors.length === 0) {
    return (
      <div className="py-4">
        <p className="text-sm text-muted-foreground">
          No merchant connectors loaded. Please ensure Merchant ID and API Key are correctly set.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {connectors.map((connector) => {
        const key = connector.merchant_connector_id || connector.connector_name;
        const displayName = connector.connector_label || connector.connector_name;
        const isToggled = toggleStates[key] ?? false; // Default to false if not in map

        return (
          <Card key={key} className="shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex flex-col">
                <Label htmlFor={`toggle-${key}`} className="font-medium">
                  {displayName}
                </Label>
                <span className="text-xs text-muted-foreground">
                  ID: {connector.merchant_connector_id} (Name: {connector.connector_name})
                </span>
              </div>
              <Switch
                id={`toggle-${key}`}
                checked={isToggled}
                onCheckedChange={(newState) => onToggleChange(key, newState)}
                aria-label={`Toggle ${displayName}`}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
