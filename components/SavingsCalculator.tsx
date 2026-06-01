'use client';

import { useMemo, useState } from 'react';
import { Calculator, TrendingDown, CheckCircle } from 'lucide-react';

type Membership = { name: string; price: number };

export function SavingsCalculator({
  listingName,
  memberships,
  defaultWashPrice,
}: {
  listingName: string;
  memberships: Membership[];
  defaultWashPrice: number;
}) {
  const [memberIdx, setMemberIdx] = useState(0);
  const [washPrice, setWashPrice] = useState(defaultWashPrice);
  const [washesPerMonth, setWashesPerMonth] = useState(4);

  const member = memberships[memberIdx] ?? memberships[0];

  const { payPerWash, monthlySavings, breakeven } = useMemo(() => {
    const ppw = washPrice * washesPerMonth;
    const savings = ppw - member.price;
    const be = washPrice > 0 ? Math.ceil(member.price / washPrice) : 0;
    return { payPerWash: ppw, monthlySavings: savings, breakeven: be };
  }, [washPrice, washesPerMonth, member.price]);

  const membershipWins = monthlySavings > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-[#0F2744] mb-1 flex items-center gap-2">
        <Calculator className="w-5 h-5 text-[#22C55E]" />
        Is an Unlimited Membership Worth It?
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Estimate your savings at {listingName} based on how often you wash.
      </p>

      <div className="space-y-4">
        {memberships.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-[#0F2744] mb-1.5">
              Membership plan
            </label>
            <select
              value={memberIdx}
              onChange={(e) => setMemberIdx(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-[#0F2744] focus:outline-none focus:ring-2 focus:ring-[#22C55E]/40"
            >
              {memberships.map((m, i) => (
                <option key={i} value={i}>
                  {m.name} — ${m.price.toFixed(2)}/mo
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[#0F2744] mb-1.5">
            Price of a single wash
          </label>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-semibold">$</span>
            <input
              type="number"
              min={1}
              step={1}
              value={washPrice}
              onChange={(e) => setWashPrice(Math.max(1, Number(e.target.value) || 0))}
              className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-[#0F2744] focus:outline-none focus:ring-2 focus:ring-[#22C55E]/40"
            />
            <span className="text-xs text-gray-400">adjust to your usual wash</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-[#0F2744]">
              Washes per month
            </label>
            <span className="text-sm font-bold text-[#22C55E]">{washesPerMonth}</span>
          </div>
          <input
            type="range"
            min={1}
            max={15}
            value={washesPerMonth}
            onChange={(e) => setWashesPerMonth(Number(e.target.value))}
            className="w-full accent-[#22C55E]"
          />
          <div className="flex justify-between text-[11px] text-gray-400 mt-1">
            <span>1</span>
            <span>15</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-center">
            <div className="text-xs text-gray-500">Pay per wash</div>
            <div className="text-xl font-bold text-[#0F2744]">${payPerWash.toFixed(2)}<span className="text-xs font-normal text-gray-400">/mo</span></div>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-100 p-3 text-center">
            <div className="text-xs text-gray-500">Membership</div>
            <div className="text-xl font-bold text-[#22C55E]">${member.price.toFixed(2)}<span className="text-xs font-normal text-gray-400">/mo</span></div>
          </div>
        </div>

        <div
          className={`rounded-lg p-3 text-sm flex items-start gap-2 ${
            membershipWins
              ? 'bg-green-50 border border-green-200 text-[#0F2744]'
              : 'bg-gray-50 border border-gray-200 text-gray-600'
          }`}
        >
          {membershipWins ? (
            <>
              <TrendingDown className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
              <span>
                The membership saves you about{' '}
                <strong className="text-[#22C55E]">${monthlySavings.toFixed(2)}/month</strong>{' '}
                (${(monthlySavings * 12).toFixed(0)}/year) at {washesPerMonth} washes a month.
              </span>
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <span>
                Paying per wash is cheaper at this frequency. The membership pays off once you wash{' '}
                <strong>{breakeven}+ times a month</strong>.
              </span>
            </>
          )}
        </div>

        <p className="text-[11px] text-gray-400">
          Estimate only. Membership price from {listingName}; confirm current pricing before signing up.
        </p>
      </div>
    </div>
  );
}
