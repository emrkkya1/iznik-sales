import { useEffect } from 'react';

import { useDelivery } from './useDeliveries';
import { useBranchLocation } from './useLocations';
import { useReceiptDraftStore } from '@/store/receiptDraft';

// Prefills the receipt draft from an existing delivery when the user opens it
// for editing (editingDeliveryId is set). Runs once per delivery id so user
// edits are never clobbered.
export function useEditPrefill(editingDeliveryId: string | null) {
  const applyEditPrefill = useReceiptDraftStore((s) => s.applyEditPrefill);
  const isReady = useReceiptDraftStore((s) => editingDeliveryId !== null && s.editingDeliveryId === editingDeliveryId && s.prefilledDeliveryId === editingDeliveryId);

  const delivery = useDelivery(editingDeliveryId);
  const branch = useBranchLocation(delivery.data?.branchId ?? null);

  useEffect(() => {
    if (!editingDeliveryId) return;
    const deliveryData = delivery.data;
    const branchData = branch.data;
    // Cached/placeholder data may belong to the previous request. The store
    // also checks target identity atomically, including multiple mounted homes.
    if (deliveryData?.id !== editingDeliveryId || !branchData || branchData.id !== deliveryData.branchId) return;

    const entries: Record<string, { delivered: number; returned: number }> = {};
    for (const item of deliveryData.items) {
      if (item.deliveredQuantity === 0 && item.returnedQuantity === 0) continue;
      entries[item.productId] = {
        delivered: item.deliveredQuantity,
        returned: item.returnedQuantity,
      };
    }
    applyEditPrefill(editingDeliveryId, {
      cityId: branchData.cityId, districtId: branchData.districtId, branchId: branchData.id,
      date: deliveryData.date, entries,
      paymentAmount: deliveryData.payments.filter(p => p.deletedAt === null).reduce((sum, p) => sum + p.amount, 0),
    });
  }, [editingDeliveryId, delivery.data, branch.data, applyEditPrefill]);

  return { delivery, branch, isReady };
}
