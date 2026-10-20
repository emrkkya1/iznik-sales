import { create } from 'zustand';

import { getIstanbulToday } from '@/utils/dates';

export type BranchPath = {
  cityId: string | null;
  districtId: string | null;
  branchId: string | null;
};

export type DraftEntry = {
  delivered: number;
  returned: number;
};

type ReceiptDraftState = {
  cityId: string | null;
  districtId: string | null;
  branchId: string | null;
  date: string;
  entries: Record<string, DraftEntry>;
  paymentAmount: number;
  isSubmitting: boolean;
  editingDeliveryId: string | null;
  prefilledDeliveryId: string | null;
  lastPath: BranchPath;
  lastDate: string;
  applyPath: (path: BranchPath) => void;
  setDate: (date: string) => void;
  setDelivered: (productId: string, quantity: number) => void;
  setReturned: (productId: string, quantity: number) => void;
  setEntries: (entries: Record<string, DraftEntry>) => void;
  setPaymentAmount: (amount: number) => void;
  setSubmitting: (submitting: boolean) => void;
  setEditingDeliveryId: (id: string | null) => void;
  beginEdit: (id: string) => void;
  applyEditPrefill: (id: string, prefill: BranchPath & { date: string; entries: Record<string, DraftEntry>; paymentAmount: number }) => void;
  rememberLast: () => void;
  reset: () => void;
  clear: () => void;
};

const EMPTY_PATH: BranchPath = {
  cityId: null,
  districtId: null,
  branchId: null,
};

function initialState() {
  return {
    cityId: null as string | null,
    districtId: null as string | null,
    branchId: null as string | null,
    date: getIstanbulToday(),
    entries: {} as Record<string, DraftEntry>,
    paymentAmount: 0,
    isSubmitting: false,
    editingDeliveryId: null as string | null,
    prefilledDeliveryId: null as string | null,
    lastPath: EMPTY_PATH,
    lastDate: getIstanbulToday(),
  };
}

function isEmpty(entry: DraftEntry): boolean {
  return entry.delivered <= 0 && entry.returned <= 0;
}

export const useReceiptDraftStore = create<ReceiptDraftState>((set) => ({
  ...initialState(),
  applyPath: (path) =>
    set((state) => ({
      ...path,
      entries: path.branchId !== state.branchId ? {} : state.entries,
    })),
  setDate: (date) => set({ date, entries: {} }),
  setDelivered: (productId, quantity) =>
    set((state) => {
      const next = Math.max(0, quantity);
      const entries = { ...state.entries };
      const current = entries[productId] ?? { delivered: 0, returned: 0 };
      const updated: DraftEntry = { ...current, delivered: next };
      if (isEmpty(updated)) {
        delete entries[productId];
      } else {
        entries[productId] = updated;
      }
      return { entries };
    }),
  setReturned: (productId, quantity) =>
    set((state) => {
      const next = Math.max(0, quantity);
      const entries = { ...state.entries };
      const current = entries[productId] ?? { delivered: 0, returned: 0 };
      const updated: DraftEntry = { ...current, returned: next };
      if (isEmpty(updated)) {
        delete entries[productId];
      } else {
        entries[productId] = updated;
      }
      return { entries };
    }),
  setEntries: (entries) => {
    const cleaned: Record<string, DraftEntry> = {};
    for (const [productId, entry] of Object.entries(entries)) {
      const delivered = Math.max(0, entry.delivered ?? 0);
      const returned = Math.max(0, entry.returned ?? 0);
      if (delivered > 0 || returned > 0) {
        cleaned[productId] = { delivered, returned };
      }
    }
    set({ entries: cleaned });
  },
  setPaymentAmount: (paymentAmount) => set({ paymentAmount }),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  setEditingDeliveryId: (editingDeliveryId) => set({ editingDeliveryId, prefilledDeliveryId: null }),
  beginEdit: (editingDeliveryId) => set((state) => ({
    ...initialState(),
    lastPath: state.lastPath,
    lastDate: state.lastDate,
    editingDeliveryId,
  })),
  applyEditPrefill: (id, prefill) => set((state) => {
    if (state.editingDeliveryId !== id || state.prefilledDeliveryId === id) return state;
    return { ...prefill, prefilledDeliveryId: id };
  }),
  rememberLast: () =>
    set((state) => ({
      lastPath: {
        cityId: state.cityId,
        districtId: state.districtId,
        branchId: state.branchId,
      },
      lastDate: state.date,
    })),
  reset: () =>
    set((state) => ({
      ...initialState(),
      cityId: state.lastPath.cityId,
      districtId: state.lastPath.districtId,
      branchId: state.lastPath.branchId,
      date: state.lastDate,
      lastPath: state.lastPath,
      lastDate: state.lastDate,
    })),
  clear: () =>
    set((state) => ({
      ...initialState(),
      lastPath: state.lastPath,
      lastDate: state.lastDate,
    })),
}));
