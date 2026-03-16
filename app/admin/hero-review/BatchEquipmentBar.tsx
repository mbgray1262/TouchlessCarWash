'use client';

import { useState } from 'react';
import { CheckSquare, X } from 'lucide-react';
import { EQUIPMENT_BRANDS } from './types';

interface BatchEquipmentBarProps {
  selectedCount: number;
  totalVisible: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onApply: (brand: string | null, model: string | null) => Promise<void>;
  getModelsForBrand: (brand: string) => string[];
  customBrands: { value: string; label: string }[];
}

export function BatchEquipmentBar({
  selectedCount,
  totalVisible,
  onSelectAll,
  onClearSelection,
  onApply,
  getModelsForBrand,
  customBrands,
}: BatchEquipmentBarProps) {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [applying, setApplying] = useState(false);

  const allBrands = [
    ...EQUIPMENT_BRANDS,
    ...customBrands.filter(cb => !EQUIPMENT_BRANDS.some(b => b.value === cb.value)),
  ];

  const models = brand ? getModelsForBrand(brand) : [];

  const handleApply = async () => {
    if (!brand) return;
    setApplying(true);
    try {
      await onApply(brand, model || null);
      setBrand('');
      setModel('');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-orange-400 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center gap-4 flex-wrap">
        {/* Selection info */}
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-medium text-gray-700">
            {selectedCount} of {totalVisible} selected
          </span>
        </div>

        {/* Select All / Clear */}
        <div className="flex items-center gap-1.5">
          {selectedCount < totalVisible && (
            <button
              onClick={onSelectAll}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              Select All
            </button>
          )}
          <button
            onClick={onClearSelection}
            className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
          >
            Clear
          </button>
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-gray-300" />

        {/* Brand dropdown */}
        <select
          value={brand}
          onChange={(e) => { setBrand(e.target.value); setModel(''); }}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <option value="">Select Brand...</option>
          {allBrands.map(b => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>

        {/* Model dropdown */}
        {brand && models.length > 0 && (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            <option value="">No Model</option>
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}

        {/* Apply button */}
        <button
          onClick={handleApply}
          disabled={!brand || applying}
          className={`
            text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors
            ${brand && !applying
              ? 'bg-orange-500 hover:bg-orange-600 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          {applying
            ? 'Applying...'
            : `Apply to ${selectedCount} listing${selectedCount === 1 ? '' : 's'}`
          }
        </button>

        {/* Close button */}
        <button
          onClick={onClearSelection}
          className="ml-auto p-1 text-gray-400 hover:text-gray-600 rounded"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
