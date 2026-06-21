'use client';

import { Printer } from 'lucide-react';

/** Triggers the browser print dialog (which doubles as "Save as PDF").
 * Lives in the no-print toolbar above the certificate. */
export function CertificatePrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 bg-[#0F2744] hover:bg-[#0F2744]/90 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
    >
      <Printer className="w-4 h-4" />
      Print / Save as PDF
    </button>
  );
}
